/*
 * lc-forensics v5.1 "data-capture" — Live Container 通用网络取证 dylib
 *
 * v5.0 → v5.1 (探针名单到手 → 响应数据捕获转正 + fallback):
 *
 *   A. 数据分片捕获 hook (探针判读定案的首选目标):
 *      [__NSCFLocalSessionTask _onqueue_didReceiveDispatchData:completion:]
 *      — CFNetwork 内部数据泵, 所有响应数据分片必经
 *      - setImplementation + 原IMP直调 (同 base 安全模式)
 *      - 读 dispatch_data → 长度 + 64KB preview (UTF-8 容错截断)
 *      - tid 关联 (self.taskIdentifier) → 与 base 的 req 行拼接
 *   B. resp 文件 fallback: lcf-resp.jsonl open 失败 → 写 base 文件
 *      (v5.0 实锤: 沙盒对 Documents 新建文件受限; 预置文件只救一次)
 *      data 行带 ev:"data" 与 base 行天然区分
 *   C. 探针升级: introspection 改为幂等 (文件已有 probe 行则跳过),
 *      避免每轮启动重写 63 方法大名单
 *
 * 安全模式不变: 基类 2 创建 selector + 1 数据 selector (全部单类真实定义),
 * 无全局枚举 / 无定时器 / 无 resume / 无 release, seq 锚点, 同步落盘
 */

#define LCF_VERSION "5.3-lineguard"
#define LOG_RELATIVE "Documents/forensics.jsonl"
#define RESP_LOG_RELATIVE "Documents/lcf-resp.jsonl"
#define DEDUP_CAP 512
#define GAP_MIN 10.0
#define GAP_MAX 60.0
#define PREVIEW_CAP 65536       /* data 行 preview 上限 (64KB) */
#define DATA_FALLBACK_MARK "lcf-resp-fallback"  /* fallback 模式标记 (stage tag) */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <time.h>
#include <stdint.h>

typedef unsigned long pthread_t;
extern int pthread_create(pthread_t*, const void*, void* (*)(void*), void*);
extern int pthread_detach(pthread_t);
extern int usleep(unsigned int);

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
extern Class       object_getClass(id);
extern const char* object_getClassName(id);
extern SEL         method_getName(Method);
extern const char* sel_getName(SEL);
extern Method*     class_copyMethodList(Class, unsigned int*);

static volatile char g_spin = 0;
static void lc_lock(void){ while(__atomic_test_and_set(&g_spin, __ATOMIC_ACQUIRE)) {} }
static void lc_unlock(void){ __atomic_clear(&g_spin, __ATOMIC_RELEASE); }

static SEL s_HTTPMethod, s_URL, s_absStr, s_body, s_len, s_bstream, s_utf8;
static SEL s_tid;     /* taskIdentifier */
static SEL s_dtwrh, s_dtwr;
static SEL s_dispatch_get_size;   /* dispatch_data_get_size */
static Class g_clsSession;
static Class g_clsLocalTask;      /* __NSCFLocalSessionTask */

static int   g_fd = -1;
static char  g_path[512] = "";
static int   g_resp_fd = -1;
static char  g_resp_path[512] = "";
static int   g_resp_fallback = 0;    /* 1 = resp 写入走 base 文件 */

static IMP g_orig_dtwrh = 0;
static IMP g_orig_dtwr  = 0;
static IMP g_orig_didd  = 0;         /* didReceiveDispatchData 原实现 */

static unsigned long long g_seq = 0;
static double g_last_ts = -1.0;
static double lc_now(void){
    struct timeval tv;
    gettimeofday(&tv, 0);
    return (double)tv.tv_sec + (double)tv.tv_usec / 1000000.0;
}

static int lc_openlog(void){
    const char* home = getenv("HOME");
    if (!home || !home[0]) return -1;
    char want[512];
    snprintf(want, sizeof(want), "%s/" LOG_RELATIVE, home);
    if (g_fd >= 0 && strcmp(want, g_path) == 0) return g_fd;
    if (g_fd >= 0) close(g_fd);
    snprintf(g_path, sizeof(g_path), "%s", want);
    g_fd = open(g_path, O_WRONLY | O_CREAT | O_APPEND | O_CLOEXEC, 0644);
    return g_fd;
}

static void lc_stage(const char* tag){
    lc_lock();
    int fd = lc_openlog();
    if (fd >= 0){
        char line[192];
        int n = snprintf(line, sizeof(line),
            "{\"ts\":%.3f,\"seq\":%llu,\"ev\":\"stage\",\"tag\":\"%s\",\"v\":\"" LCF_VERSION "\",\"pid\":%d}\n",
            lc_now(), ++g_seq, tag, (int)getpid());
        if (write(fd, line, (size_t)n) < 0){
            close(g_fd); g_fd = -1;
        }
    }
    lc_unlock();
}

static void lc_write_locked(const char* line){
    /* v5.3: 行分隔兜底 — snprintf 截断可能吞掉结尾 \n (v5.2 实测 34 行两行粘连),
     * 写前检查末字符, 非 \n 一律补上 */
    size_t len = strlen(line);
    char buf2[1600];
    if (len > 0 && line[len-1] != '\n' && len < sizeof(buf2)){
        memcpy(buf2, line, len);
        buf2[len] = '\n';
        buf2[len+1] = 0;
        line = buf2;
    }
    int fd = lc_openlog();
    if (fd >= 0 && write(fd, line, strlen(line)) < 0){
        close(g_fd); g_fd = -1;
    }
}

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

/* ==================================================================
 * resp 文件通道 (v5.1: fallback 到 base 文件)
 * ================================================================== */
static int lc_open_resp(void){
    if (g_resp_fallback) return lc_openlog();   /* fallback: 借 base 文件 */
    const char* home = getenv("HOME");
    if (!home || !home[0]) return -1;
    char want[512];
    snprintf(want, sizeof(want), "%s/" RESP_LOG_RELATIVE, home);
    if (g_resp_fd >= 0 && strcmp(want, g_resp_path) == 0) return g_resp_fd;
    if (g_resp_fd >= 0) close(g_resp_fd);
    snprintf(g_resp_path, sizeof(g_resp_path), "%s", want);
    g_resp_fd = open(want, O_WRONLY | O_CREAT | O_APPEND | O_CLOEXEC, 0644);
    if (g_resp_fd < 0){
        g_resp_fallback = 1;                     /* 新建失败 → 永久切 base 通道 */
        lc_stage(DATA_FALLBACK_MARK);
        return lc_openlog();
    }
    return g_resp_fd;
}

static void lc_resp_write(const char* line){
    lc_lock();
    int fd = lc_open_resp();
    if (fd >= 0 && write(fd, line, strlen(line)) < 0){
        if (g_resp_fallback){ close(g_fd); g_fd = -1; }
        else { close(g_resp_fd); g_resp_fd = -1; }
    }
    lc_unlock();
}

/* ---------- URL 去重计数表 (环形) ---------- */
typedef struct { char url[512]; unsigned n; } dupent;
static dupent g_dup[DEDUP_CAP];
static int    g_ndup = 0;

static unsigned lc_dup_count_locked(const char* url){
    for (int i = 0; i < g_ndup; i++){
        if (strcmp(g_dup[i].url, url) == 0) return ++g_dup[i].n;
    }
    int slot;
    if (g_ndup < DEDUP_CAP){
        slot = g_ndup++;
    } else {
        int min = 0;
        for (int i = 1; i < DEDUP_CAP; i++) if (g_dup[i].n < g_dup[min].n) min = i;
        slot = min;
    }
    snprintf(g_dup[slot].url, sizeof(g_dup[slot].url), "%s", url);
    g_dup[slot].n = 1;
    return 1;
}

/* ---------- 请求行公共构造 ---------- */
static void lc_req_line(char* line, size_t cap, const char* ev, id req, id task,
                        char** out_tail, size_t* out_tailrem){
    char method[16] = "?";
    char url[640]   = "";
    char bodyinfo[64] = "";
    unsigned dupn = 1;
    unsigned long long tid = 0;

    if (req){
        id m = (id)objc_msgSend(req, s_HTTPMethod);
        if (m){
            const char* c = (const char*)objc_msgSend(m, s_utf8);
            if (c) snprintf(method, sizeof(method), "%.10s", c);
        }
        id u = (id)objc_msgSend(req, s_URL);
        if (u){
            id abs = (id)objc_msgSend(u, s_absStr);
            if (abs){
                const char* c = (const char*)objc_msgSend(abs, s_utf8);
                if (c) snprintf(url, sizeof(url), "%s", c);
            }
        }
        id b = (id)objc_msgSend(req, s_body);
        if (b){
            unsigned long long blen = (unsigned long long)(uintptr_t)objc_msgSend(b, s_len);
            id st = (id)objc_msgSend(req, s_bstream);
            snprintf(bodyinfo, sizeof(bodyinfo), ",\"bodyLen\":%llu,\"stream\":%d",
                     blen, st ? 1 : 0);
        }
    }
    if (task){
        tid = (unsigned long long)(uintptr_t)objc_msgSend(task, s_tid);
    }

    double ts = lc_now();
    char dupinfo[24] = "";
    lc_lock();
    if (url[0]){
        dupn = lc_dup_count_locked(url);
        if (dupn > 1) snprintf(dupinfo, sizeof(dupinfo), ",\"dup\":%u", dupn);
        if (g_last_ts > 0){
            double d = ts - g_last_ts;
            if (d > GAP_MIN && d <= GAP_MAX){
                char gapline[160];
                int gn = snprintf(gapline, sizeof(gapline),
                    "{\"ts\":%.3f,\"seq\":%llu,\"ev\":\"gap\",\"sec\":%.1f,\"v\":\"" LCF_VERSION "\",\"pid\":%d}\n",
                    ts, ++g_seq, d, (int)getpid());
                lc_write_locked(gapline);
            }
        }
        g_last_ts = ts;
    }
    lc_unlock();

    char* p = line; size_t rem = cap;
    int n = snprintf(p, rem,
        "{\"ts\":%.3f,\"seq\":%llu,\"ev\":\"%s\",\"v\":\"" LCF_VERSION "\",\"method\":\"%s\",\"url\":",
        ts, ++g_seq, ev, method);
    p += n; rem -= (size_t)n;
    lc_json_str(&p, &rem, url);
    n = snprintf(p, rem, "%s%s,\"tid\":%llu",
                 dupinfo, bodyinfo, tid);
    p += n; rem -= (size_t)n;
    *out_tail = p; *out_tailrem = rem;
}

/* hook 1: dataTaskWithRequest:completionHandler: */
static id dtwrh_hook(id self, SEL _cmd, id req, id handler){
    id task = ((id(*)(id,SEL,id,id))g_orig_dtwrh)(self, _cmd, req, handler);
    char line[1280];
    char* p; size_t rem;
    lc_req_line(line, sizeof(line), "req", req, task, &p, &rem);
    snprintf(p, rem, ",\"ret\":\"%s\",\"cls\":\"%.24s\",\"pid\":%d}\n",
             task ? "ok" : "NIL", object_getClassName(self), (int)getpid());
    lc_lock(); lc_write_locked(line); lc_unlock();
    return task;
}

/* hook 2: dataTaskWithRequest: (delegate 版) */
static id dtwr_hook(id self, SEL _cmd, id req){
    id task = ((id(*)(id,SEL,id))g_orig_dtwr)(self, _cmd, req);
    char line[1280];
    char* p; size_t rem;
    lc_req_line(line, sizeof(line), "req-delegate", req, task, &p, &rem);
    snprintf(p, rem, ",\"ret\":\"%s\",\"cls\":\"%.24s\",\"pid\":%d}\n",
             task ? "ok" : "NIL", object_getClassName(self), (int)getpid());
    lc_lock(); lc_write_locked(line); lc_unlock();
    return task;
}

/* ==================================================================
 * v5.1 数据分片捕获: _onqueue_didReceiveDispatchData:completion:
 *
 * dispatch_data 是不可变字节块 (CFNetwork 内部表示):
 *   size   = dispatch_data_get_size(dd)
 *   预览   = dispatch_data_create_map 映射后按指针读 (容错: 映射失败跳过预览)
 * 本模块只读不持有: dispatch_data_create_map 返回的 buffer 由调用方
 * dispatch_data 管辖, 不需要 release (铁律 1)
 * ================================================================== */
typedef void* dispatch_data_t;
typedef const struct dispatch_source_vtable_s* dispatch_source_t;
extern unsigned long   dispatch_data_get_size(dispatch_data_t);
extern dispatch_data_t dispatch_data_create_map(dispatch_data_t, const void**, size_t*, size_t*);

static void lcf_data_line(id self, dispatch_data_t dd, char* line, size_t cap){
    unsigned long long tid = (unsigned long long)(uintptr_t)objc_msgSend(self, s_tid);
    unsigned long long size = dispatch_data_get_size(dd);

    /* 预览: 只 map 不持有; map 失败则跳过 preview (size 仍有)
     * v5.2: 严格 ASCII 化 — >=0x80 一律 '.' (JSON 必须是合法 UTF-8,
     * 二进制分片里的 0xa4 等字节直写会产生非法序列, 损坏整行) */
    const void* buf = 0; size_t blen = 0, seg = 0;
    char preview[128] = "";
    if (size > 0){
        dispatch_data_t mapped = dispatch_data_create_map(dd, &buf, &blen, &seg);
        if (buf && blen > 0){
            size_t n = blen < sizeof(preview) ? blen : sizeof(preview) - 1;
            char* q = preview;
            for (size_t i = 0; i < n && (size_t)(q - preview) < sizeof(preview) - 8; i++){
                unsigned char c = ((const unsigned char*)buf)[i];
                if (c == '"' || c == '\\'){ *q++ = '\\'; *q++ = (char)c; }
                else if (c >= 0x20 && c < 0x7f){ *q++ = (char)c; }
                else { *q++ = '.'; }   /* 控制符 + >=0x80 全部替换 */
            }
            *q = 0;
        }
        (void)mapped;   /* mapped 与 dd 同源, 不持有 */
    }
    char* p = line; size_t rem = cap;
    int w = snprintf(p, rem,
        "{\"ts\":%.3f,\"seq\":%llu,\"ev\":\"data\",\"v\":\"" LCF_VERSION "\",\"tid\":%llu,\"bytes\":%llu,\"preview\":",
        lc_now(), ++g_seq, tid, size);
    p += w; rem -= (size_t)w;
    lc_json_str(&p, &rem, preview);
    snprintf(p, rem, ",\"pid\":%d}\n", (int)getpid());
}

static void didd_hook(id self, SEL _cmd, dispatch_data_t dd, void* completion){
    if (g_orig_didd && dd){
        char line[1600];   /* v5.3: 256→1600 — preview 127B + 头尾 ~130B 曾逼近 256 上限, snprintf 截断吞 \n 致两行粘连 */
        lcf_data_line(self, dd, line, sizeof(line));
        lc_lock(); lc_write_locked(line); lc_unlock();
    }
    ((void(*)(id,SEL,dispatch_data_t,void*))g_orig_didd)(self, _cmd, dd, completion);
}

/* ==================================================================
 * 探针 (v5.1: 幂等 — resp 文件已有 probe 行则跳过, 免每轮重写)
 * ================================================================== */
static int lc_resp_has_probe(void){
    const char* home = getenv("HOME");
    if (!home || !home[0]) return 0;
    char p[512];
    snprintf(p, sizeof(p), "%s/" RESP_LOG_RELATIVE, home);
    int fd = open(p, O_RDONLY | O_CLOEXEC);
    if (fd < 0) return 0;
    char buf[4096];
    ssize_t r = read(fd, buf, sizeof(buf) - 1);
    close(fd);
    if (r <= 0) return 0;
    buf[r] = 0;
    return strstr(buf, "\"ev\":\"probe\"") != 0;
}

static void lcf_resp_probe_class(const char* clsname){
    Class cls = (Class)objc_getClass(clsname);
    if (!cls){
        char line[192];
        snprintf(line, sizeof(line),
            "{\"ts\":%.3f,\"ev\":\"probe\",\"cls\":\"%s\",\"absent\":1,\"v\":\"" LCF_VERSION "\",\"pid\":%d}\n",
            lc_now(), clsname, (int)getpid());
        lc_resp_write(line);
        return;
    }
    unsigned int n = 0;
    Method* list = class_copyMethodList(cls, &n);
    size_t cap = (size_t)n * 100 + 128;
    char* buf = (char*)malloc(cap);
    if (!buf){ if (list) free(list); return; }
    size_t off = 0;
    buf[off] = 0;
    int ncand = 0;
    for (unsigned int i = 0; i < n && off + 100 < cap; i++){
        SEL s = (SEL)method_getName(list[i]);
        const char* nm = s ? sel_getName(s) : "?";
        int w = snprintf(buf + off, cap - off, "%s%s", i ? "|" : "", nm);
        if (w > 0) off += (size_t)w;
        if (strstr(nm, "didReceiveData") || strstr(nm, "didReceive") ||
            strstr(nm, "_onqueue")){
            ncand++;
        }
    }
    size_t need = off + 256;
    char* full = (char*)malloc(need);
    if (full){
        snprintf(full, need,
            "{\"ts\":%.3f,\"ev\":\"probe\",\"cls\":\"%s\",\"methods\":%u,\"cands\":%d,\"list\":\"%s\",\"v\":\"" LCF_VERSION "\",\"pid\":%d}\n",
            lc_now(), clsname, n, ncand, buf, (int)getpid());
        lc_resp_write(full);
        free(full);
    }
    free(buf);
    if (list) free(list);
}

static void* lcf_resp_probe_thread(void* arg){
    (void)arg;
    int waited = 0;
    lc_stage("probe-thread-start");
    for (int i = 0; i < 240; i++){
        const char* home = getenv("HOME");
        if (home && home[0]){
            char p[512];
            snprintf(p, sizeof(p), "%s/" LOG_RELATIVE, home);
            struct stat st;
            if (stat(p, &st) == 0 && st.st_size > 0) break;
        }
        usleep(500 * 1000);
        waited++;
    }
    {
        char tag[48];
        snprintf(tag, sizeof(tag), "probe-wait-passed:%d", waited);
        lc_stage(tag);
    }
    if (!lc_resp_has_probe()){
        lcf_resp_probe_class("__NSCFLocalSessionTask");
        lcf_resp_probe_class("__NSCFURLSessionTask");
        lcf_resp_probe_class("__NSCFLocalSessionDataTask");
    }
    {
        char line[128];
        snprintf(line, sizeof(line),
            "{\"ts\":%.3f,\"ev\":\"done\",\"v\":\"" LCF_VERSION "\",\"pid\":%d}\n",
            lc_now(), (int)getpid());
        lc_resp_write(line);
    }
    lc_stage("probe-done");
    return 0;
}

__attribute__((constructor))
static void lcf_ctor(void){
    lc_stage("S1-ctor");

    /* v5.1: 探针线程 */
    {
        pthread_t t;
        if (pthread_create(&t, 0, lcf_resp_probe_thread, 0) == 0){
            pthread_detach(t);
        } else {
            lc_stage("probe-pthread-fail");
        }
    }

    s_HTTPMethod = sel_registerName("HTTPMethod");
    s_URL        = sel_registerName("URL");
    s_absStr     = sel_registerName("absoluteString");
    s_body       = sel_registerName("HTTPBody");
    s_len        = sel_registerName("length");
    s_bstream    = sel_registerName("HTTPBodyStream");
    s_utf8       = sel_registerName("UTF8String");
    s_tid        = sel_registerName("taskIdentifier");
    s_dtwrh      = sel_registerName("dataTaskWithRequest:completionHandler:");
    s_dtwr       = sel_registerName("dataTaskWithRequest:");
    g_clsSession = (Class)objc_getClass("NSURLSession");
    g_clsLocalTask = (Class)objc_getClass("__NSCFLocalSessionTask");
    lc_stage("S2-sels");

    if (g_clsSession){
        Method m = class_getInstanceMethod(g_clsSession, s_dtwrh);
        if (m){
            IMP old = method_getImplementation(m);
            if ((void*)old != (void*)dtwrh_hook){
                method_setImplementation(m, (IMP)dtwrh_hook);
                g_orig_dtwrh = old;
            }
        }
        m = class_getInstanceMethod(g_clsSession, s_dtwr);
        if (m){
            IMP old = method_getImplementation(m);
            if ((void*)old != (void*)dtwr_hook){
                method_setImplementation(m, (IMP)dtwr_hook);
                g_orig_dtwr = old;
            }
        }
    }

    /* v5.1: 数据分片捕获 hook (探针名单定案的首选目标) */
    if (g_clsLocalTask){
        SEL dd = sel_registerName("_onqueue_didReceiveDispatchData:completion:");
        Method m = class_getInstanceMethod(g_clsLocalTask, dd);
        if (m){
            IMP old = method_getImplementation(m);
            if ((void*)old != (void*)didd_hook){
                method_setImplementation(m, (IMP)didd_hook);
                g_orig_didd = old;
            }
        }
    }

    char tag[64];
    int n = (g_orig_dtwrh ? 1 : 0) + (g_orig_dtwr ? 1 : 0);
    snprintf(tag, sizeof(tag), "S3-hooked:%d", n);
    lc_stage(tag);
    lc_stage(g_orig_didd ? "S4-data-hooked" : "S4-data-miss");
}
