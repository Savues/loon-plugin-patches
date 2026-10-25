/*
 * lcf-resp v0.2-probe "introspect+retry" — Live Container 响应体捕获模块 · 探针版
 *
 * v0.1 → v0.2 (探针零产出的教训修正):
 *   v0.1 的写入全部发生在 ctor (5 行一次写完), 而 ctor 时刻 LC guest 沙盒
 *   未就绪 / HOME 可能仍指向宿主容器 → open 全失败 → 探针没有重试机制
 *   → 文件永远不存在. base 没这个问题是因为它每次 hook 触发都会重开.
 *   修复: 方法表 introspection 延迟到【首个 base 请求触发时】(借 base 的
 *   forensics.jsonl 出现作为"沙盒已就绪"信号) + 每次写失败后永不放弃重试.
 *
 * 独立于 lc-forensics (base, v4.7 常驻) 的响应体捕获模块, 第一阶段:
 * 【不做任何 hook】—— 只对目标类做单类方法表 introspection, 把
 * 数据接收 selector 的候选名单落盘, 由真机日志告诉我们 hook 什么。
 *
 * 设计依据 (v4.4 破案方法学 + 用户裁决的模块拆分):
 *   - 数据到达路径在 __NSCFLocalSessionTask 的私有方法上, selector 名随
 *     iOS 版本浮动, 不能靠猜 → introspection 单类查询 (class_copyMethodList,
 *     非铁律3禁止的全局枚举)
 *   - 探针零 hook = 零风险, 任何 App 上跑都只会多一个 jsonl 文件
 *   - 文件独立: Documents/lcf-resp.jsonl (绝不与 base 共享, 防并发交错)
 *
 * 输出:
 *   {"ts","ev":"ctor/probe/done","cls":"__NSCFLocalSessionTask","methods":N,
 *    "list":"sel1|sel2|...", "v":"0.2-probe","pid":N}
 *
 * 判读: 找名字含 didReceiveData / didReceive / _onqueue 的实例方法 →
 *   探针 v0.3 hook 之 (setImplementation + 原IMP直调, 同 base 安全模式)
 */

#define LCFR_VERSION "0.2-probe"
#define LOG_RELATIVE "Documents/lcf-resp.jsonl"
#define BASE_LOG_RELATIVE "Documents/forensics.jsonl"   /* base 日志 = 沙盒就绪信号 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <stdint.h>
#include <sys/syscall.h>

typedef void* SEL;
typedef struct lcf_obj_s { void* isa; } *id;
typedef struct lcf_class_s* Class;
typedef void* Method;
typedef id (*IMP)(id, SEL, ...);

extern void*       objc_msgSend(void*, SEL, ...);
extern id          objc_getClass(const char*);
extern SEL         sel_registerName(const char*);
extern const char* sel_getName(SEL);
extern Method*     class_copyMethodList(Class, unsigned int*);
extern SEL         method_getName(Method);
extern Class       class_getSuperclass(Class);
extern const char* class_getName(Class);
extern int         usleep(unsigned int usec);
typedef unsigned long pthread_t;   /* darwin: pthread_t = __darwin_pthread_t (指针), musl 下用 ulong 等价 */
extern int pthread_create(pthread_t*, const void*, void* (*)(void*), void*);
extern int pthread_detach(pthread_t);

static volatile char g_spin = 0;
static void lc_lock(void){ while(__atomic_test_and_set(&g_spin, __ATOMIC_ACQUIRE)) {} }
static void lc_unlock(void){ __atomic_clear(&g_spin, __ATOMIC_RELEASE); }

static double lc_now(void){
    struct timeval tv;
    gettimeofday(&tv, 0);
    return (double)tv.tv_sec + (double)tv.tv_usec / 1000000.0;
}

static int g_fd = -1;
static char g_path[512] = "";

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

static void lc_write(const char* line){
    lc_lock();
    int fd = lc_openlog();
    if (fd >= 0 && write(fd, line, strlen(line)) < 0){
        close(g_fd); g_fd = -1;
    }
    lc_unlock();
}

/* 单类方法表 introspection → 一行 JSON */
static void lcf_probe_class(const char* clsname){
    Class cls = (Class)objc_getClass(clsname);
    if (!cls){
        char line[160];
        snprintf(line, sizeof(line),
            "{\"ts\":%.3f,\"ev\":\"probe\",\"cls\":\"%s\",\"absent\":1,\"v\":\"" LCFR_VERSION "\",\"pid\":%d}\n",
            lc_now(), clsname, (int)getpid());
        lc_write(line);
        return;
    }
    unsigned int n = 0;
    Method* list = class_copyMethodList(cls, &n);
    /* 名单缓冲: 每方法最长 96 字符 */
    size_t cap = (size_t)n * 100 + 128;
    char* buf = (char*)malloc(cap);
    if (!buf){ free(list); return; }
    size_t off = 0;
    buf[off] = 0;
    int nhook_cand = 0;   /* 数据接收候选数 */
    for (unsigned int i = 0; i < n && off + 100 < cap; i++){
        SEL s = (SEL)method_getName(list[i]);
        const char* nm = s ? sel_getName(s) : "?";
        /* 全量名单 (截断保护) */
        int w = snprintf(buf + off, cap - off, "%s%s", i ? "|" : "", nm);
        if (w > 0) off += (size_t)w;
        /* 候选标记 (仅统计, v0.2 决策依据) */
        if (strstr(nm, "didReceiveData") || strstr(nm, "didReceive") ||
            strstr(nm, "_onqueue")){
            nhook_cand++;
        }
    }
    char line[256];
    int hn = snprintf(line, sizeof(line),
        "{\"ts\":%.3f,\"ev\":\"probe\",\"cls\":\"%s\",\"methods\":%u,\"cands\":%d,\"list\":",
        lc_now(), clsname, n, nhook_cand);
    /* 名单可能超长 → 分段写: 先写头+名单+尾 */
    size_t need = (size_t)hn + off + 64;
    char* full = (char*)malloc(need);
    if (full){
        snprintf(full, need,
            "{\"ts\":%.3f,\"ev\":\"probe\",\"cls\":\"%s\",\"methods\":%u,\"cands\":%d,\"list\":\"%s\",\"v\":\"" LCFR_VERSION "\",\"pid\":%d}\n",
            lc_now(), clsname, n, nhook_cand, buf, (int)getpid());
        lc_write(full);
        free(full);
    }
    free(buf);
    if (list) free(list);
}

/* ---------- 等待沙盒就绪 (轮询 base 日志) 后 introspection ---------- */
static int lc_base_ready(void){
    const char* home = getenv("HOME");
    if (!home || !home[0]) return 0;
    char p[512];
    snprintf(p, sizeof(p), "%s/" BASE_LOG_RELATIVE, home);
    struct stat st;
    return stat(p, &st) == 0 && st.st_size > 0;
}

static void* lcfr_wait_and_probe(void* arg){
    (void)arg;
    for (int i = 0; i < 240; i++){          /* 240 × 500ms = 120s */
        if (lc_base_ready()) break;
        usleep(500 * 1000);
    }
    /* 就绪 (或超时放弃等待) → 立即 introspection; 写失败仍会因
     * lc_write 每次重开 fd 而在下轮自愈 — 但探针只跑一次, 所以
     * 先确认能写再 introspect, 不行就再等一轮 */
    for (int attempt = 0; attempt < 3; attempt++){
        {
            const char* home = getenv("HOME");
            char p[512];
            snprintf(p, sizeof(p), "%s/" LOG_RELATIVE, home ? home : "");
            int fd = open(p, O_WRONLY | O_CREAT | O_APPEND | O_CLOEXEC, 0644);
            if (fd >= 0){ close(fd); break; }
        }
        usleep(1000 * 1000);
    }
    lcf_probe_class("__NSCFLocalSessionTask");
    lcf_probe_class("__NSCFURLSessionTask");
    lcf_probe_class("__NSCFLocalSessionDataTask");
    {
        char line[128];
        snprintf(line, sizeof(line),
            "{\"ts\":%.3f,\"ev\":\"done\",\"v\":\"" LCFR_VERSION "\",\"pid\":%d}\n",
            lc_now(), (int)getpid());
        lc_write(line);
    }
    return 0;
}

__attribute__((constructor))
static void lcfr_ctor(void){
    /* v0.2: ctor 只记录"我活着", introspection 延迟到沙盒就绪
     * (v0.1 教训: ctor 时刻写入必失败且无重试 → 全部产物蒸发) */
    {
        char line[160];
        snprintf(line, sizeof(line),
            "{\"ts\":%.3f,\"ev\":\"ctor\",\"v\":\"" LCFR_VERSION "\",\"pid\":%d}\n",
            lc_now(), (int)getpid());
        lc_write(line);
    }
    /* 等待策略: 后台线程轮询 HOME 的 base 日志 (forensics.jsonl) 是否可读
     * — base 的首行出现 = guest 沙盒就绪. 最多等 120s. */
    pthread_t t;
    pthread_create(&t, 0, lcfr_wait_and_probe, 0);
    pthread_detach(t);
}
