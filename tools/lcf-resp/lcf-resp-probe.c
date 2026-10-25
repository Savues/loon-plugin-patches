/*
 * lcf-resp v0.1-probe "introspect" — Live Container 响应体捕获模块 · 探针版
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
 *   {"ts","ev":"probe","cls":"__NSCFLocalSessionTask","methods":N,
 *    "list":"sel1|sel2|...", "v":"0.1-probe","pid":N}
 *   另探 __NSCFURLSessionTask / __NSCFLocalSessionDataTask 两类作对照
 *
 * 判读: 找名字含 didReceiveData / didReceive / _onqueue 的实例方法 →
 *   探针 v0.2 hook 之 (setImplementation + 原IMP直调, 同 base 安全模式)
 */

#define LCFR_VERSION "0.1-probe"
#define LOG_RELATIVE "Documents/lcf-resp.jsonl"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
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
extern const char* sel_getName(SEL);
extern Method*     class_copyMethodList(Class, unsigned int*);
extern const char* method_getName_str(Method);   /* 实际用 sel_getName(method_getName(m)) */
extern SEL         method_getName(Method);
extern Class       class_getSuperclass(Class);
extern const char* class_getName(Class);

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

__attribute__((constructor))
static void lcfr_ctor(void){
    /* 阶段标记 */
    {
        char line[160];
        snprintf(line, sizeof(line),
            "{\"ts\":%.3f,\"ev\":\"ctor\",\"v\":\"" LCFR_VERSION "\",\"pid\":%d}\n",
            lc_now(), (int)getpid());
        lc_write(line);
    }
    /* 三类 introspection (探针核心; 全部是确定性系统类, 零 hook) */
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
}
