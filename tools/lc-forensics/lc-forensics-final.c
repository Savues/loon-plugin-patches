/*
 * lc-forensics v4.5 "dual-sel" — Live Container 通用网络取证 dylib
 *
 * v4.4 → v4.5: 保持 v4.4 验证过的安全模式, 仅扩展一个 selector:
 *   + dataTaskWithRequest: (delegate 版, 无 completionHandler)
 *   两个 hook 全部落在 NSURLSession 基类的真实定义上 (setImplementation),
 *   与 v4.4 唯一 selector 同一安装面 — 风险不变, 覆盖面扩大。
 *
 * v4.4 minimal-probe 的结论 (豆瓣真机二分实证):
 *   - 全类枚举 / resume hook / dispatch_after 定时器 三者之一 = 豆瓣闪退因
 *   - 基类单 selector hook + 同步落盘 = 豆瓣稳定 + 44 req/启动
 *   - 因此 v4.5 定型: 永不引入枚举/定时器/resume
 *
 * 结构:
 *   S1-ctor → S2-sels → S3-hooked:<n> 阶段标记同步落盘
 *   req 行: {ts, ev, method, url, bodyLen, stream, ret, cls, pid}
 *   已知无害瑕疵: 设备端 ts 偶发错乱 (宿主时钟虚拟化), 行序仍可信
 */

#define LCF_VERSION "4.5-dual-sel"
#define LOG_RELATIVE "Documents/forensics.jsonl"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <stdint.h>

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

static volatile char g_spin = 0;
static void lc_lock(void){ while(__atomic_test_and_set(&g_spin, __ATOMIC_ACQUIRE)) {} }
static void lc_unlock(void){ __atomic_clear(&g_spin, __ATOMIC_RELEASE); }

static SEL s_HTTPMethod, s_URL, s_absStr, s_body, s_len, s_bstream, s_utf8;
static SEL s_dtwrh;   /* dataTaskWithRequest:completionHandler: */
static SEL s_dtwr;    /* dataTaskWithRequest: */
static Class g_clsSession;

static int   g_fd = -1;
static char  g_path[512] = "";

static IMP g_orig_dtwrh = 0;
static IMP g_orig_dtwr  = 0;

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

/* 阶段标记: 立即同步落盘 */
static void lc_stage(const char* tag){
    lc_lock();
    int fd = lc_openlog();
    if (fd >= 0){
        char line[192];
        int n = snprintf(line, sizeof(line),
            "{\"ts\":%.3f,\"ev\":\"stage\",\"tag\":\"%s\",\"v\":\"" LCF_VERSION "\",\"pid\":%d}\n",
            lc_now(), tag, (int)getpid());
        if (write(fd, line, (size_t)n) < 0){
            close(g_fd); g_fd = -1;
        }
    }
    lc_unlock();
}

/* 已持锁的同步写 */
static void lc_write_locked(const char* line){
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

/* 请求行公共构造: method/url/body 三件套 → line 缓冲头部 */
static void lc_req_head(char* line, size_t cap, const char* ev, id req,
                        char** out_p, size_t* out_rem){
    char method[16] = "?";
    char url[640]   = "";
    char bodyinfo[64] = "";
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
    char* p = line; size_t rem = cap;
    int n = snprintf(p, rem,
        "{\"ts\":%.3f,\"ev\":\"%s\",\"v\":\"" LCF_VERSION "\",\"method\":\"%s\",\"url\":",
        lc_now(), ev, method);
    p += n; rem -= (size_t)n;
    lc_json_str(&p, &rem, url);
    *out_p = p; *out_rem = rem;
    /* bodyinfo 交给调用方拼接 (它要知道 ret/cls 的插入位置) */
    memcpy(p, bodyinfo, strlen(bodyinfo) + 1);
    /* 注: p/rem 由调用方继续用 — bodyinfo 已在 p 处, 调用方直接 ret/cls 接上 */
    *out_p = p + strlen(bodyinfo);
    *out_rem = rem - strlen(bodyinfo);
}

/* hook 1: dataTaskWithRequest:completionHandler: (2 实参) */
static id dtwrh_hook(id self, SEL _cmd, id req, id handler){
    id task = ((id(*)(id,SEL,id,id))g_orig_dtwrh)(self, _cmd, req, handler);
    char line[1280];
    char* p; size_t rem;
    lc_req_head(line, sizeof(line), "req", req, &p, &rem);
    snprintf(p, rem, ",\"ret\":\"%s\",\"cls\":\"%.24s\",\"pid\":%d}\n",
             task ? "ok" : "NIL", object_getClassName(self), (int)getpid());
    lc_lock(); lc_write_locked(line); lc_unlock();
    return task;
}

/* hook 2: dataTaskWithRequest: (delegate 版, 1 实参) */
static id dtwr_hook(id self, SEL _cmd, id req){
    id task = ((id(*)(id,SEL,id))g_orig_dtwr)(self, _cmd, req);
    char line[1280];
    char* p; size_t rem;
    lc_req_head(line, sizeof(line), "req-delegate", req, &p, &rem);
    snprintf(p, rem, ",\"ret\":\"%s\",\"cls\":\"%.24s\",\"pid\":%d}\n",
             task ? "ok" : "NIL", object_getClassName(self), (int)getpid());
    lc_lock(); lc_write_locked(line); lc_unlock();
    return task;
}

__attribute__((constructor))
static void lcf_ctor(void){
    lc_stage("S1-ctor");

    s_HTTPMethod = sel_registerName("HTTPMethod");
    s_URL        = sel_registerName("URL");
    s_absStr     = sel_registerName("absoluteString");
    s_body       = sel_registerName("HTTPBody");
    s_len        = sel_registerName("length");
    s_bstream    = sel_registerName("HTTPBodyStream");
    s_utf8       = sel_registerName("UTF8String");
    s_dtwrh      = sel_registerName("dataTaskWithRequest:completionHandler:");
    s_dtwr       = sel_registerName("dataTaskWithRequest:");
    g_clsSession = (Class)objc_getClass("NSURLSession");
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
    char tag[64];
    int n = (g_orig_dtwrh ? 1 : 0) + (g_orig_dtwr ? 1 : 0);
    snprintf(tag, sizeof(tag), "S3-hooked:%d", n);
    lc_stage(tag);
}
