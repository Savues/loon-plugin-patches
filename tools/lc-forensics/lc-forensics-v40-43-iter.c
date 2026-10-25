/*
 * lc-forensics v4.3 "narrow-install" — Live Container 通用网络取证 dylib
 *
 * v4.2 → v4.3 (豆瓣闪退 vs JavDB 正常的分流证据):
 *  R8. 安装面收窄: 不再对 runtime 里全部 13 个 NSURLSession 子类改 IMP,
 *      只 hook NSURLSession / __NSCFURLSession / __NSURLSessionLocal 三个
 *      确定性基类上的真实定义 (+ resume 同理收窄到 Task 基类)。
 *      证据: JavDB (0 session 子类, install 14 hooks) 全链路 ret:ok;
 *            豆瓣 (13 session 子类) 装完 2s 内崩, 日志一行未落。
 *      豆瓣 runtime 有第三方/混淆类参与 (风控 mssdk 常驻 hook), 对任意
 *      子类 method_setImplementation 的交互面不可控 —— 全部放弃。
 *      基类 hook + objc_msgSend 派发语义 = 所有实例调用必经 (子类不覆盖时)。
 *
 * v4.1 → v4.2 (历史):
 *  R6. 自旋锁死锁: lcf_late_cb 持锁调 install_all → lc_emit 重入 lc_lock
 *      → 启动 2s 冻结 → watchdog 击杀。修复: lc_emit_locked, 持锁区禁 emit。
 *  R7. hook 递归防护: 每个 sel 全局只 hook 首个真实定义类。
 *
 * v4.0 → v4.1 (历史):
 *  R1. 移除全部 objc_release/objc_retain (getter 返回值不持有, release = 过度释放)
 *  R2. class_getInstanceMethod 替代 class_respondsToInstance (导出性不确定)
 *  R3. HOME 每次 flush 实时重解析, 变化即重开 fd
 *  R4. hook 记账表 (class,sel,orig,idx), 原 IMP 沿 self 类链精确反查
 *  R5. strdup 守卫
 *
 * 写入: 惰性刷新, ctor 期只缓冲不落盘; 首个请求/2s/10s/30s 触发刷新
 */

#define LCF_VERSION "4.3-narrow-install"
#define LOG_RELATIVE "Documents/forensics.jsonl"
#define LOG_MAXBYTES (2*1024*1024)
#define LOG_KEEPTAIL (512*1024)
#define PENDING_CAP 512
#define HOOKTAB_CAP 64

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <stdint.h>

/* ---------- ObjC runtime API（手写声明） ---------- */
typedef void* SEL;
typedef struct lcf_obj_s { void* isa; } *id;
typedef struct lcf_class_s* Class;
typedef void* Method;
typedef id (*IMP)(id, SEL, ...);

extern void*       objc_msgSend(void*, SEL, ...);
extern id          objc_getClass(const char*);
extern SEL         sel_registerName(const char*);
extern Method      class_getInstanceMethod(Class, SEL);
extern IMP         method_getImplementation(Method);
extern void        method_setImplementation(Method, IMP);
extern Class       class_getSuperclass(Class);
extern Class       object_getClass(id);
extern const char* object_getClassName(id);
extern int         objc_getClassList(Class*, int);
extern const char* class_getName(Class);

/* ---------- libdispatch（C API） ---------- */
typedef unsigned long long dispatch_time_t;
extern void*           dispatch_get_global_queue(long identifier, unsigned long flags);
extern dispatch_time_t dispatch_time(dispatch_time_t when, long long delta);
extern void            dispatch_after_f(dispatch_time_t when, void* queue, void* ctx, void (*fn)(void*));

/* ---------- 自旋锁 ---------- */
static volatile char g_spin = 0;
static void lc_lock(void){ while(__atomic_test_and_set(&g_spin, __ATOMIC_ACQUIRE)) {} }
static void lc_unlock(void){ __atomic_clear(&g_spin, __ATOMIC_RELEASE); }

/* ---------- selector 预注册 ---------- */
static SEL s_HTTPMethod, s_URL, s_absStr, s_body, s_len, s_bstream;
static SEL s_curReq, s_utf8, s_resumeSel;

/* ---------- hook 记账表 ---------- */
typedef struct { Class cls; SEL sel; IMP orig; int idx; } hookent;
static hookent g_hooktab[HOOKTAB_CAP];
static int     g_nhooks = 0;

/* ---------- 14 个任务创建 selector ---------- */
static const char* const kTaskSels[] = {
    "dataTaskWithRequest:",
    "dataTaskWithURL:",
    "dataTaskWithRequest:completionHandler:",
    "dataTaskWithURL:completionHandler:",
    "uploadTaskWithRequest:fromData:",
    "uploadTaskWithRequest:fromFile:",
    "uploadTaskWithStreamedRequest:",
    "downloadTaskWithRequest:",
    "downloadTaskWithURL:",
    "downloadTaskWithResumeData:",
    "uploadTaskWithRequest:fromData:completionHandler:",
    "downloadTaskWithRequest:completionHandler:",
    "downloadTaskWithResumeData:completionHandler:",
    "uploadTaskWithStreamedRequest:completionHandler:",
};
#define NSELS ((int)(sizeof(kTaskSels)/sizeof(kTaskSels[0])))
static SEL s_regsel[NSELS];

static Class g_clsSession;
static Class g_clsTask;

/* ---------- 缓冲与文件 ---------- */
static char* g_pending[PENDING_CAP];
static int   g_np = 0;
static int   g_fd = -1;
static char  g_path[512] = "";
static volatile int g_defer = 1;   /* ctor 期置 1: 只缓冲不落盘 */

static double lc_now(void){
    struct timeval tv;
    gettimeofday(&tv, 0);
    return (double)tv.tv_sec + (double)tv.tv_usec / 1000000.0;
}

/* JSON 字符串转义写入 *p（容量 *rem），转义 " \ 控制符；UTF-8 原样通过 */
static void lc_json_str(char** p, size_t* rem, const char* s){
    char* q = *p; size_t cap = *rem;
    if (!q || cap < 3) return;
    *q++ = '"'; cap--;
    for (const unsigned char* u = (const unsigned char*)(s ? s : ""); *u && cap > 8; u++){
        unsigned char c = *u;
        if (c == '"' || c == '\\'){ *q++ = '\\'; *q++ = (char)c; cap -= 2; }
        else if (c == '\n'){ *q++='\\'; *q++='n'; cap-=2; }
        else if (c == '\r'){ *q++='\\'; *q++='r'; cap-=2; }
        else if (c == '\t'){ *q++='\\'; *q++='t'; cap-=2; }
        else if (c < 0x20){ q += snprintf(q, cap, "\\u%04x", c); cap = *rem - (size_t)(q - *p); }
        else { *q++ = (char)c; cap--; }
        if (cap <= 8) break;
    }
    if (cap >= 2){ *q++ = '"'; cap--; }
    *q = 0;
    *rem = cap;
    *p = q;
}

/* ---------- 刷新: HOME 实时重解析, 变化即重开 ---------- */
static void lc_try_flush_locked(void){
    if (g_defer) return;
    const char* home = getenv("HOME");
    char want[512];
    want[0] = 0;
    if (home && home[0]) snprintf(want, sizeof(want), "%s/" LOG_RELATIVE, home);
    if (g_fd >= 0 && want[0] && strcmp(want, g_path) != 0){
        close(g_fd); g_fd = -1;          /* HOME 已切换 → 重开到当前容器 */
    }
    if (g_fd < 0){
        if (!want[0]) return;
        snprintf(g_path, sizeof(g_path), "%s", want);
        g_fd = open(g_path, O_WRONLY | O_CREAT | O_APPEND | O_CLOEXEC, 0644);
        if (g_fd < 0){ g_path[0] = 0; return; }   /* 沙盒未就绪 → 继续缓冲 */
    }
    for (int i = 0; i < g_np; i++){
        if (!g_pending[i]) continue;
        size_t len = strlen(g_pending[i]);
        if (write(g_fd, g_pending[i], len) < 0){
            close(g_fd); g_fd = -1;
            return;
        }
        free(g_pending[i]);
        g_pending[i] = 0;
    }
    g_np = 0;
    /* 2MB 环形截断: 保留尾部 512KB, 对齐到行首 */
    struct stat st;
    if (fstat(g_fd, &st) == 0 && st.st_size > LOG_MAXBYTES && st.st_size > LOG_KEEPTAIL){
        size_t n = LOG_KEEPTAIL;
        char* buf = (char*)malloc(n);
        if (buf){
            ssize_t r = pread(g_fd, buf, n, st.st_size - (off_t)n);
            close(g_fd);
            g_fd = open(g_path, O_WRONLY | O_CREAT | O_TRUNC | O_CLOEXEC, 0644);
            if (g_fd >= 0 && r > 0){
                char* nl = (char*)memchr(buf, '\n', (size_t)r);
                if (nl) write(g_fd, nl + 1, (size_t)r - (size_t)(nl - buf) - 1);
            }
            free(buf);
        }
    }
}

/* ---------- 已持锁的入队 (死锁修复: 持锁区内严禁走 lc_emit) ---------- */
static void lc_emit_locked(const char* line){
    /* 调用前提: 已持锁 */
    if (g_np < PENDING_CAP){
        char* cp = strdup(line);
        if (cp) g_pending[g_np++] = cp;
    } else {
        free(g_pending[0]);
        memmove(&g_pending[0], &g_pending[1], sizeof(char*) * (PENDING_CAP - 1));
        g_pending[PENDING_CAP - 1] = 0;
        char* cp = strdup(line);
        if (cp) g_pending[PENDING_CAP - 1] = cp;
    }
}

static void lc_emit(const char* line){
    lc_lock();
    lc_emit_locked(line);
    lc_try_flush_locked();
    lc_unlock();
}

static void lc_flush_cb(void* ctx){ (void)ctx; lc_lock(); lc_try_flush_locked(); lc_unlock(); }

/* ---------- 请求描述 → 一行 JSON (零 release: getter 返回值只读不持有) ---------- */
static void lc_describe_request(char* out, size_t outcap, const char* ev,
                                id request, const char* extra){
    char method[16] = "?";
    char url[640]   = "";
    char bodyinfo[64] = "";

    if (request){
        id m = (id)objc_msgSend(request, s_HTTPMethod);
        if (m){
            const char* c = (const char*)objc_msgSend(m, s_utf8);
            if (c) snprintf(method, sizeof(method), "%.10s", c);
        }
        id u = (id)objc_msgSend(request, s_URL);
        if (u){
            id abs = (id)objc_msgSend(u, s_absStr);
            if (abs){
                const char* c = (const char*)objc_msgSend(abs, s_utf8);
                if (c) snprintf(url, sizeof(url), "%s", c);
            }
        }
        id b = (id)objc_msgSend(request, s_body);
        if (b){
            unsigned long long blen = (unsigned long long)(uintptr_t)
                objc_msgSend(b, s_len);
            id st = (id)objc_msgSend(request, s_bstream);
            snprintf(bodyinfo, sizeof(bodyinfo), ",\"bodyLen\":%llu,\"stream\":%d",
                     blen, st ? 1 : 0);
        }
    }
    char* p = out; size_t rem = outcap;
    int n = snprintf(p, rem,
        "{\"ts\":%.3f,\"ev\":\"%s\",\"v\":\"" LCF_VERSION "\",\"method\":\"%s\",\"url\":",
        lc_now(), ev, method);
    p += n; rem -= (size_t)n;
    lc_json_str(&p, &rem, url);
    snprintf(p, rem, "%s,\"pid\":%d%s}\n", bodyinfo, (int)getpid(), extra ? extra : "");
}

/* ---------- 原 IMP 反查: 沿 self 类链向上, 首个命中 = 运行时派发目标 ---------- */
static IMP lcf_find_orig(id self, SEL _cmd, int* idx_out){
    Class c = object_getClass(self);
    while (c){
        for (int i = 0; i < g_nhooks; i++){
            if (g_hooktab[i].sel == _cmd && g_hooktab[i].cls == c){
                if (idx_out) *idx_out = g_hooktab[i].idx;
                return g_hooktab[i].orig;
            }
        }
        c = class_getSuperclass(c);
    }
    return 0;
}

/* ==================================================================
 * 层A hook: 任务创建 (统一签名, 多余寄存器实参 arm64 下无害)
 * ================================================================== */
static id task_hook_impl(id self, SEL _cmd, id a0, id a1, id a2, id a3){
    int idx = -1;
    IMP orig = lcf_find_orig(self, _cmd, &idx);
    if (!orig) return (id)objc_msgSend(self, _cmd);

    /* request 判定: a0/a1 之一有 HTTPMethod 方法表项 → 是 NSURLRequest */
    id req = 0;
    if (a0 && class_getInstanceMethod(object_getClass(a0), s_HTTPMethod)){
        req = a0;
    } else if (a1 && class_getInstanceMethod(object_getClass(a1), s_HTTPMethod)){
        req = a1;
    }
    char line[1536];
    lc_describe_request(line, sizeof(line), "req", req, "");

    id task = 0;
    switch (idx){
        case 2: case 3: case 4: case 5:
        case 11: case 12: case 13:
            task = ((id(*)(id,SEL,id,id))orig)(self,_cmd,a0,a1); break;
        case 10:
            task = ((id(*)(id,SEL,id,id,id))orig)(self,_cmd,a0,a1,a2); break;
        default:
            task = ((id(*)(id,SEL,id))orig)(self,_cmd,a0); break;
    }
    if (line[0]){
        char tail[160];
        snprintf(tail, sizeof(tail),
                 ",\"ret\":%s,\"cls\":\"%.24s\"",
                 task ? "ok" : "NIL", object_getClassName(self));
        size_t L = strlen(line);
        if (L > 2 && line[L-2] == '}' && line[L-1] == '\n'){
            line[L-2] = 0;
            strncat(line, tail, sizeof(line) - strlen(line) - 3);
            strcat(line, "}\n");
        }
        lc_emit(line);
    }
    return task;
}

/* ==================================================================
 * 层B hook: resume 兜底
 * ================================================================== */
static void resume_hook_impl(id self, SEL _cmd){
    int dummy = -1;
    IMP orig = lcf_find_orig(self, _cmd, &dummy);
    id cur = (id)objc_msgSend(self, s_curReq);
    char line[1536];
    char extra[96];
    snprintf(extra, sizeof(extra), ",\"cls\":\"%.24s\"",
             object_getClassName(self));
    lc_describe_request(line, sizeof(line), "resume", cur, extra);
    lc_emit(line);
    if (orig) ((void(*)(id,SEL))orig)(self, _cmd);
}

/* ==================================================================
 * 安装器: 枚举全部类, 每个 sel 只 hook 首个真实定义类 (防递归)
 *
 * ★ 豆瓣闪退嫌疑区 (v4.3 改动):
 *   不再枚举【全部类】并在任意子类上装 hook —— 只 hook NSURLSession
 *   和 __NSCFURLSession/__NSURLSessionLocal 这些确定性基类上的真实定义。
 *   豆瓣 runtime 里 13 个 session 子类同时改 IMP, 任一第三方类自身
 *   做过 swizzle/有非标准布局, method_setImplementation 交互即可爆。
 *   (JavDB runtime 干净 0 子类 → 稳; 豆瓣 13 子类 → 崩, 与观测一致)
 * ================================================================== */
static Class g_clsCFSession;   /* __NSCFURLSession / __NSURLSessionLocal */
static int  g_cf_hooked_once = 0;

static int lcf_is_descendant(Class cls, Class ancestor){
    Class cur = cls;
    while (cur){
        if (cur == ancestor) return 1;
        cur = class_getSuperclass(cur);
    }
    return 0;
}

/* 方法是否定义在 cls 自身 (父类无此方法, 或 IMP 不同) */
static int lcf_defined_here(Class cls, SEL sel){
    Method m = class_getInstanceMethod(cls, sel);
    if (!m) return 0;
    IMP imp = method_getImplementation(m);
    Class sup = class_getSuperclass(cls);
    if (!sup) return 1;
    Method m2 = class_getInstanceMethod(sup, sel);
    if (!m2) return 1;
    return method_getImplementation(m2) != imp;
}

/* 该 sel 是否已 hook 过任何类 */
static int lcf_sel_already_hooked(SEL sel){
    for (int i = 0; i < g_nhooks; i++)
        if (g_hooktab[i].sel == sel) return 1;
    return 0;
}

static void lcf_add_hook(Class cls, SEL sel, IMP old, int idx){
    if (g_nhooks >= HOOKTAB_CAP) return;
    g_hooktab[g_nhooks].cls  = cls;
    g_hooktab[g_nhooks].sel  = sel;
    g_hooktab[g_nhooks].orig = old;
    g_hooktab[g_nhooks].idx  = idx;
    g_nhooks++;
}

/* 从已分配类列表安装 (回调与 ctor 共用; 调用方持锁或不持锁但禁 lc_emit)
 * v4.3 收窄: 只在 3 个确定性类上找真实定义:
 *   NSURLSession / __NSCFURLSession / __NSURLSessionLocal
 * 子类 (AFURLSessionManager 等) 不碰 —— 豆瓣 13 子类全改 = 崩, JavDB 0 子类 = 稳 */
static void lcf_install_from(Class* buf, int got, int* out_s, int* out_t){
    int n_session = 0, n_task = 0;
    Class targets[4];
    int n_targets = 0;
    targets[n_targets++] = g_clsSession;
    if (g_clsCFSession) targets[n_targets++] = g_clsCFSession;
    for (int i = 0; i < got && n_targets < 4; i++){
        const char* nm = class_getName(buf[i]);
        if (!nm) continue;
        /* 运行时实际类名 (iOS 9+ 真实现是 __NSCFURLSession, 桥接壳 __NSURLSessionLocal) */
        if (nm[0] == '_' && nm[1] == '_'){
            if (strcmp(nm, "__NSCFURLSession") == 0 || strcmp(nm, "__NSURLSessionLocal") == 0){
                int dup = 0;
                for (int j = 0; j < n_targets; j++) if (targets[j] == buf[i]) dup = 1;
                if (!dup) targets[n_targets++] = buf[i];
            }
        }
    }
    for (int t = 0; t < n_targets; t++){
        Class cls = targets[t];
        for (int k = 0; k < NSELS; k++){
            if (lcf_sel_already_hooked(s_regsel[k])) continue;   /* R7 */
            if (!lcf_defined_here(cls, s_regsel[k])) continue;
            Method m = class_getInstanceMethod(cls, s_regsel[k]);
            IMP old = method_getImplementation(m);
            if ((void*)old == (void*)task_hook_impl) continue;
            method_setImplementation(m, (IMP)task_hook_impl);
            lcf_add_hook(cls, s_regsel[k], old, k);
            n_session++;
        }
    }
    /* 层B: resume 只 hook __NSCFURLSessionTask/NSURLSessionTask 的真实定义类之一 */
    Class task_targets[3];
    int n_tt = 0;
    task_targets[n_tt++] = g_clsTask;
    Class cfTask = (Class)objc_getClass("__NSCFURLSessionTask");
    if (cfTask) task_targets[n_tt++] = cfTask;
    for (int t = 0; t < n_tt; t++){
        Class cls = task_targets[t];
        if (lcf_sel_already_hooked(s_resumeSel)) continue;
        if (!lcf_defined_here(cls, s_resumeSel)) continue;
        Method m = class_getInstanceMethod(cls, s_resumeSel);
        IMP old = method_getImplementation(m);
        if ((void*)old != (void*)resume_hook_impl){
            method_setImplementation(m, (IMP)resume_hook_impl);
            lcf_add_hook(cls, s_resumeSel, old, -1);
            n_task++;
        }
    }
    if (out_s) *out_s = n_session;
    if (out_t) *out_t = n_task;
}

/* 安装 + 记 install 行 (只允许在【未持锁】上下文调用) */
static void lcf_install_all(void){
    if (!g_clsSession || !g_clsTask) return;
    int ncls = objc_getClassList(0, 0);
    if (ncls <= 0) return;
    Class* buf = (Class*)malloc(sizeof(Class) * (size_t)ncls);
    if (!buf) return;
    int got = objc_getClassList(buf, ncls);
    int n_session = 0, n_task = 0;
    lcf_install_from(buf, got, &n_session, &n_task);
    free(buf);
    char line[256];
    snprintf(line, sizeof(line),
        "{\"ts\":%.3f,\"ev\":\"install\",\"v\":\"" LCF_VERSION
        "\",\"classes\":%d,\"sessionHooked\":%d,\"taskHooked\":%d,"
        "\"totalHooks\":%d,\"pid\":%d}\n",
        lc_now(), got, n_session, n_task, g_nhooks, (int)getpid());
    lc_emit(line);   /* 未持锁 — R6 */
}

/* ==================================================================
 * 构造函数: 只装 hook, 不落盘 (defer=1), 沙盒/HOMME 问题全部推后
 * ================================================================== */
static void lcf_init_sels(void){
    s_HTTPMethod = sel_registerName("HTTPMethod");
    s_URL        = sel_registerName("URL");
    s_absStr     = sel_registerName("absoluteString");
    s_body       = sel_registerName("HTTPBody");
    s_len        = sel_registerName("length");
    s_bstream    = sel_registerName("HTTPBodyStream");
    s_curReq     = sel_registerName("currentRequest");
    s_utf8       = sel_registerName("UTF8String");
    s_resumeSel  = sel_registerName("resume");
    for (int i = 0; i < NSELS; i++) s_regsel[i] = sel_registerName(kTaskSels[i]);
    g_clsSession   = (Class)objc_getClass("NSURLSession");
    g_clsTask      = (Class)objc_getClass("NSURLSessionTask");
    g_clsCFSession = (Class)objc_getClass("__NSCFURLSession");
}

static void lcf_late_cb(void* ctx){
    (void)ctx;
    /* R6: 不持锁 —— install_all 内部自己 emit/flush, 全程无重入 */
    lcf_install_all();
    lc_lock();
    lc_try_flush_locked();
    lc_unlock();
}

__attribute__((constructor))
static void lcf_ctor(void){
    lcf_init_sels();

    char line[256];
    snprintf(line, sizeof(line),
        "{\"ts\":%.3f,\"ev\":\"ctor\",\"v\":\"" LCF_VERSION "\",\"pid\":%d}\n",
        lc_now(), (int)getpid());
    lc_emit(line);

    lcf_install_all();

    g_defer = 0;   /* 装配完成; 首个请求或 2s 定时器开始落盘 (届时 HOME 已是 guest) */

    void* gq = dispatch_get_global_queue(0, 0);
    dispatch_after_f(dispatch_time(0, 2LL * 1000 * 1000 * 1000),
                     gq, 0, lcf_late_cb);
    dispatch_after_f(dispatch_time(0, 10LL * 1000 * 1000 * 1000),
                     gq, 0, lc_flush_cb);
    dispatch_after_f(dispatch_time(0, 30LL * 1000 * 1000 * 1000),
                     gq, 0, lc_flush_cb);
}
