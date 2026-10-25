/*
 * lc-forensics v4.7 "seq-anchor" — Live Container 通用网络取证 dylib
 *
 * v4.6 → v4.7 (真机时钟取证后的修正, 仍是纯日志侧):
 *   F. seq 字段: 进程内自增序号 — 行序唯一锚点。
 *      【环境事实】LC guest 里 clock_gettime(CLOCK_MONOTONIC) 也被虚拟化:
 *      v4.6 实测 up 出现 4 组时钟域 (真monotonic/wall/mach基准/纳秒级),
 *      任何系统时钟都不可信 → seq 是唯一绝对单调量 (零系统调用)
 *   G. up 字段删除 (四组噪声无分析价值; ts 保留作参考)
 *   H. gap 消毒: 相邻行 ts 差 ∈ (10s, 60s] 才产 gap 行;
 *      时钟跳变 (差值巨大/倒退) 一律忽略 — 宁漏勿假
 *
 * 继承安全模式 (豆瓣 288 行实证 + v4.5 334 行实证):
 *   仅 NSURLSession 基类 2 个创建 selector, 无枚举/定时器/resume/release
 */

#define LCF_VERSION "4.7-seq-anchor"
#define LOG_RELATIVE "Documents/forensics.jsonl"
#define DEDUP_CAP 512          /* URL 去重表容量 (环形) */
#define GAP_MIN 10.0           /* 静默下限 (秒) */
#define GAP_MAX 60.0           /* 可信窗口上限 — 超过视为时钟跳变 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <time.h>
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
static SEL s_tid;     /* taskIdentifier */
static SEL s_dtwrh;   /* dataTaskWithRequest:completionHandler: */
static SEL s_dtwr;    /* dataTaskWithRequest: */
static Class g_clsSession;

static int   g_fd = -1;
static char  g_path[512] = "";

static IMP g_orig_dtwrh = 0;
static IMP g_orig_dtwr  = 0;

/* 进程内行序计数器 (唯一可靠锚点 — 系统时钟全被虚拟化) */
static unsigned long long g_seq = 0;
/* 上一条请求的 wall ts (gap 检测, 消毒逻辑见 lc_req_line) */
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

/* 阶段标记: 立即同步落盘 */
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

/* ---------- URL 去重计数表 (环形, 内存内, 不落盘) ---------- */
typedef struct { char url[512]; unsigned n; } dupent;
static dupent g_dup[DEDUP_CAP];
static int    g_ndup = 0;

/* 返回该 URL 的出现序号 (1-based); 已存在则原位自增 */
static unsigned lc_dup_count_locked(const char* url){
    for (int i = 0; i < g_ndup; i++){
        if (strcmp(g_dup[i].url, url) == 0) return ++g_dup[i].n;
    }
    int slot;
    if (g_ndup < DEDUP_CAP){
        slot = g_ndup++;
    } else {
        /* 满: 淘汰计数最小者 (最不可能再出现的长尾) */
        int min = 0;
        for (int i = 1; i < DEDUP_CAP; i++) if (g_dup[i].n < g_dup[min].n) min = i;
        slot = min;
    }
    snprintf(g_dup[slot].url, sizeof(g_dup[slot].url), "%s", url);
    g_dup[slot].n = 1;
    return 1;
}

/* ---------- 请求行公共构造 ---------- */
/* 产出: {"ts":..,"seq":N,"ev":EV,...,"tid":T,...tail */
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
        /* gap 消毒: ts 差 ∈ (GAP_MIN, GAP_MAX] 才可信为真实静默;
         * 差值巨大/负值 = 时钟跳变/域切换, 一律忽略 (宁漏勿假) */
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
    s_tid        = sel_registerName("taskIdentifier");
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
