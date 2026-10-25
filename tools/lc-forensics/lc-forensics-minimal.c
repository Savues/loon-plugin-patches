/*
 * lc-forensics v4.4 "minimal-probe" — 二分诊断版 (功能极简, 定位豆瓣闪退)
 *
 * 与 v4.3 的差异 (全部是减法):
 *   - 删 dispatch_after_f 三连 (v4.0 无定时器时豆瓣能落 install 行 → 定时器嫌疑)
 *   - 删 lcf_late_cb 补装
 *   - 删 objc_getClassList 全类枚举 (mssdk 并发改类时的竞争窗口嫌疑)
 *   - 删 resume hook (第二 hook 面嫌疑)
 *   - 只 hook 一个 selector: [NSURLSession dataTaskWithRequest:completionHandler:]
 *   - 每个阶段标记【立即同步落盘】(不再缓冲等定时器, 任何时刻死都能留下证据):
 *     S1 ctor 进入 / S2 init_sels 完成 / S3 hook 装配完成
 *   - HOME 每次写前实时取
 *
 * 判读表:
 *   豆瓣不崩 + S1-S3 全落 → 崩因在枚举/resume/定时器之一 → v4.5 逐项加回
 *   豆瓣仍崩 + 只落到 S1/S2 → 崩在 setImplementation 那一行 (mssdk 与我们
 *   对 NSURLSession 基类的 hook 争抢) → 放弃 swizzle, 转 NSURLProtocol 架构
 *   豆瓣仍崩 + 0 行 → ctor 期 HOME 已错/写入路径问题 (回到 v2 时代之谜)
 */

#define LCF_VERSION "4.4-minimal-probe"
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
static Class g_clsSession;

static int   g_fd = -1;
static char  g_path[512] = "";

static double lc_now(void){
    struct timeval tv;
    gettimeofday(&tv, 0);
    return (double)tv.tv_sec + (double)tv.tv_usec / 1000000.0;
}

/* 每次写前实时解析 HOME; fd 缓存但路径比对 */
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

/* 阶段标记: 立即同步落盘 (带自旋锁, 各线程安全) */
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

static IMP g_orig_dtwrh = 0;

/* hook: id task = [session dataTaskWithRequest:req completionHandler:h] */
static id dtwrh_hook(id self, SEL _cmd, id req, id handler){
    char line[1280];
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
    id task = ((id(*)(id,SEL,id,id))g_orig_dtwrh)(self, _cmd, req, handler);
    char* p = line; size_t rem = sizeof(line);
    int n = snprintf(p, rem,
        "{\"ts\":%.3f,\"ev\":\"req\",\"v\":\"" LCF_VERSION "\",\"method\":\"%s\",\"url\":",
        lc_now(), method);
    p += n; rem -= (size_t)n;
    lc_json_str(&p, &rem, url);
    snprintf(p, rem, "%s,\"ret\":\"%s\",\"cls\":\"%.24s\",\"pid\":%d}\n",
             bodyinfo,      /* bodyinfo 自带前导逗号或为空 */
             task ? "ok" : "NIL", object_getClassName(self), (int)getpid());
    lc_lock();
    int fd = lc_openlog();
    if (fd >= 0 && write(fd, line, strlen(line)) < 0){ close(g_fd); g_fd = -1; }
    lc_unlock();
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
    }
    lc_stage(g_orig_dtwrh ? "S3-hooked" : "S3-miss");
}
