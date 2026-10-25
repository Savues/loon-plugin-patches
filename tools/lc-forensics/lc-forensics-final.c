/*
 * lc-forensics v6.0 "har-parity" — Live Container 通用网络取证 dylib
 *
 * v5.3 → v6.0 (对标 Loon HAR 的字段能力, 用户裁决: 配额不做, 模块仅测试时启用):
 *
 *   A. resp 行 (对标 response.status/headers/mimeType/redirectURL):
 *      hook [__NSCFLocalSessionTask _onqueue_didReceiveResponse:completion:]
 *      (探针名单 ◆ 验证过存在) — NSHTTPURLResponse 上取 statusCode /
 *      allHeaderFields / MIMEType, tid 关联
 *   B. fin 行 (task 生命周期闭合):
 *      hook [_onqueue_didFinishWithError:] (探针名单 ● 验证过) —
 *      error 有无 → ok/err, error.localizedDescription 摘要
 *   C. 响应体重组落盘 (对标 content.text):
 *      data hook 分片按 tid 累积 (上限 8MB/task), task 结束时写
 *      Documents/lcf-resp/<tid>-<status>-<type>.bin — 原始字节
 *      (gzip/br 的压缩字节原样存, 与 HAR base64 同 philosophy)
 *   D. req 行增强 (对标 request headers/cookies):
 *      currentRequest.allHeaderFields → UA / content-type / cookie 摘要
 *      (对象已在手上, 零新增 hook 面)
 *
 * 安全模式不变: 单类真实定义 hook (创建2 + 数据1 + 响应头1 + 结束1 = 5个),
 * 无全局枚举 / 无定时器 / 无 resume / 无 release, seq 锚点, 同步落盘
 */

#define LCF_VERSION "7.4-volatile-seq"
#define LOG_RELATIVE "Documents/forensics.jsonl"
#define RESP_LOG_RELATIVE "Documents/lcf-resp.jsonl"
#define RESP_DIR_RELATIVE "Documents/lcf-resp"
#define DEDUP_CAP 512
#define GAP_MIN 10.0
#define GAP_MAX 60.0
#define PREVIEW_CAP 65536       /* data 行 preview 上限 (64KB) */
#define DATA_FALLBACK_MARK "lcf-resp-fallback"  /* fallback 模式标记 (stage tag) */
#define REASM_MAX (8*1024*1024) /* 单 task 重组上限 8MB (用户裁决: 不设配额, 仅测试启用) */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <time.h>
#include <stdint.h>

typedef char BOOLish;   /* v6.1: objc BOOL 返回值类型 */
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
static SEL s_curReq, s_allHdr, s_statusCode, s_mime, s_hdrValue;   /* v6.0 */
static SEL s_response;                                             /* v6.8: task.response */
static SEL s_localizedDesc;                                        /* v6.0 */
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
static IMP g_orig_didresp = 0;       /* didReceiveResponse 原实现 (v6.0) */
static IMP g_orig_didresp2 = 0;      /* didReceiveResponse:redirectRequest: 原实现 (v6.5) */
static IMP g_orig_didfin  = 0;       /* didFinishWithError 原实现 (v6.0) */

static volatile unsigned long long g_seq = 0;   /* v7.4: 防 O2 跨锁缓存 (++ 取号必须真访存) */
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

/* v7.3: 已持锁 — 回填 seq 占位 ("seq":0 处原位覆盖为实际值), 追加尾段, 写盘 */
static void lc_write_seq_locked(const char* prefix, const char* suffix){
    char buf[2048];
    size_t plen = strlen(prefix);
    if (plen >= sizeof(buf) - 32) return;
    memcpy(buf, prefix, plen + 1);
    unsigned long long v = ++g_seq;
    char* seqpos = strstr(buf, "\"seq\":");
    if (seqpos){
        char* num = seqpos + 6;   /* "seq": 后的 0 */
        char rest[1600];
        strcpy(rest, num + 1);    /* 跳过占位的 '0', 保留其后的 ,... */
        snprintf(num, sizeof(buf) - (size_t)(num - buf), "%llu%s", v, rest);
    }
    size_t blen = strlen(buf);
    if (blen + strlen(suffix) < sizeof(buf) - 2){
        memcpy(buf + blen, suffix, strlen(suffix) + 1);
    }
    int fd = lc_openlog();
    if (fd >= 0 && write(fd, buf, strlen(buf)) < 0){
        close(g_fd); g_fd = -1;
    }
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

/* v7.2: POST body 落盘 (锁外 IO) — 文件名 lcf-req/<tid>-<method>.bin
 * 广告 SDK 上报内容取证 (stats/batch / event 等) */
static void lcf_reqbody_write(unsigned long long tid, const char* method, id body, unsigned long long blen){
    if (!body || blen == 0 || blen > (2*1024*1024)) return;   /* 2MB 上限 */
    static SEL bytesSel = 0;
    if (!bytesSel) bytesSel = sel_registerName("bytes");
    const void* p = (const void*)objc_msgSend(body, bytesSel);
    if (!p) return;
    const char* home = getenv("HOME");
    if (!home || !home[0]) return;
    char dir[512], path[560];
    snprintf(dir, sizeof(dir), "%s/Documents/lcf-req", home);
    mkdir(dir, 0755);
    snprintf(path, sizeof(path), "%s/%llu-%s.bin", dir, tid, method ? method : "GET");
    int fd = open(path, O_WRONLY | O_CREAT | O_TRUNC | O_CLOEXEC, 0644);
    if (fd >= 0){
        write(fd, p, (size_t)blen);
        close(fd);
    }
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
    /* v7.2: POST body 落盘 (锁外 IO) */
    if (req && task){
        id b = (id)objc_msgSend(req, s_body);
        if (b){
            unsigned long long blen = (unsigned long long)(uintptr_t)objc_msgSend(b, s_len);
            if (blen > 0 && blen <= (2*1024*1024)){
                unsigned long long tid = (unsigned long long)(uintptr_t)objc_msgSend(task, s_tid);
                char m[16] = "GET";
                id mo = (id)objc_msgSend(req, s_HTTPMethod);
                if (mo){ const char* c = (const char*)objc_msgSend(mo, s_utf8); if (c) snprintf(m, sizeof(m), "%.10s", c); }
                lcf_reqbody_write(tid, m, b, blen);
            }
        }
    }
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
    if (req && task){
        id b = (id)objc_msgSend(req, s_body);
        if (b){
            unsigned long long blen = (unsigned long long)(uintptr_t)objc_msgSend(b, s_len);
            if (blen > 0 && blen <= (2*1024*1024)){
                unsigned long long tid = (unsigned long long)(uintptr_t)objc_msgSend(task, s_tid);
                char m[16] = "GET";
                id mo = (id)objc_msgSend(req, s_HTTPMethod);
                if (mo){ const char* c = (const char*)objc_msgSend(mo, s_utf8); if (c) snprintf(m, sizeof(m), "%.10s", c); }
                lcf_reqbody_write(tid, m, b, blen);
            }
        }
    }
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

/* v7.1 前向声明 */
static void lcf_reasm_append_locked(unsigned long long tid, unsigned long long taskkey, dispatch_data_t dd);
extern int g_diag_reasm_enter, g_diag_resp_enter, g_diag_fin_enter;

static void didd_hook(id self, SEL _cmd, dispatch_data_t dd, void* completion){
    if (g_orig_didd && dd){
        char line[1600];
        lcf_data_line(self, dd, line, sizeof(line));
        /* v6.4 修复: diag 标记必须在拿锁之前写 — lc_stage 内部 lc_lock,
         * 持锁区再调 = 自旋死锁 (v6.3 豆瓣黑屏根因, 与 v4.1 同型) */
        if (g_diag_reasm_enter < 3){
            g_diag_reasm_enter++;
            lc_stage("diag-reasm-enter");
        }
        lc_lock();
        /* v7.3: seq 在写盘锁内分配 (data 行前缀 seq:0 占位) */
        char* cut = strstr(line, ",\"pid\":");
        if (cut){
            *cut = 0;
            char suffix[64];
            snprintf(suffix, sizeof(suffix), ",\"pid\":%d}\n", (int)getpid());
            lc_write_seq_locked(line, suffix);
        } else {
            lc_write_locked(line);
        }
        /* v6.0: 分片进重组缓冲 (append 不拿锁, 持锁区安全) */
        unsigned long long tid = (unsigned long long)(uintptr_t)objc_msgSend(self, s_tid);
        lcf_reasm_append_locked(tid, (unsigned long long)(uintptr_t)self, dd);
        lc_unlock();
        if (g_diag_reasm_enter == 3){
            g_diag_reasm_enter = 4;
            lc_stage("diag-reasm-survived");
        }
    }
    ((void(*)(id,SEL,dispatch_data_t,void*))g_orig_didd)(self, _cmd, dd, completion);
}

/* ==================================================================
 * v6.0-A: 响应体重组缓冲 (对标 content.text)
 * ================================================================== */
#define REASM_SLOTS 32
typedef struct {
    unsigned long long tid;
    unsigned long long taskkey;   /* v7.1: self 指针哈希 — tid 复用 (连接池) 防串写 */
    unsigned long long total;
    char*  buf;
    size_t cap;
    size_t len;
    int    status;
    char   mime[64];
    int    used;
} reasm_t;
static reasm_t g_reasm[REASM_SLOTS];

static reasm_t* lcf_reasm_slot(unsigned long long tid, unsigned long long taskkey, int create){
    /* v7.1: (tid, taskkey) 双键 — tid 会被连接池复用, 单键必串 */
    for (int i = 0; i < REASM_SLOTS; i++){
        if (g_reasm[i].used && g_reasm[i].tid == tid && g_reasm[i].taskkey == taskkey)
            return &g_reasm[i];
    }
    if (!create) return 0;
    for (int i = 0; i < REASM_SLOTS; i++){
        if (!g_reasm[i].used){
            memset(&g_reasm[i], 0, sizeof(reasm_t));
            g_reasm[i].used = 1;
            g_reasm[i].tid = tid;
            g_reasm[i].taskkey = taskkey;
            return &g_reasm[i];
        }
    }
    if (g_reasm[0].buf){ free(g_reasm[0].buf); }
    memset(&g_reasm[0], 0, sizeof(reasm_t));
    g_reasm[0].used = 1;
    g_reasm[0].tid = tid;
    g_reasm[0].taskkey = taskkey;
    return &g_reasm[0];
}

/* 分片追加 (锁外调用者持有 slot 指针? 否 — 简化: data hook 内持锁追加) */
static void lcf_reasm_append_locked(unsigned long long tid, unsigned long long taskkey, dispatch_data_t dd){
    reasm_t* s = lcf_reasm_slot(tid, taskkey, 1);
    if (!s) return;
    unsigned long long sz = dispatch_data_get_size(dd);
    if (s->len + sz > REASM_MAX) return;      /* 超 8MB: 丢弃后续 (截断标记靠 fin 行 bytes 对比) */
    if (s->len + sz > s->cap){
        size_t ncap = s->cap ? s->cap * 2 : 65536;
        while (ncap < s->len + sz) ncap *= 2;
        char* nb = (char*)realloc(s->buf, ncap);
        if (!nb) return;
        s->buf = nb; s->cap = ncap;
    }
    const void* p = 0; size_t blen = 0, seg = 0;
    dispatch_data_t mapped = dispatch_data_create_map(dd, &p, &blen, &seg);
    if (p && blen){
        memcpy(s->buf + s->len, p, blen);
        s->len += blen;
    }
    (void)mapped;
}

/* v7.0: 持锁摘槽 — 堆分配返回 (v6.9 的 static out 多线程竞态:
 * 线程A摘槽 → write_file 期间线程B摘槽覆盖 static out → A 写的就是 B 的指针)
 * 调用方负责 free(buf) 与本体 */
static reasm_t* lcf_reasm_take_slot(unsigned long long tid, unsigned long long taskkey){
    reasm_t* s = lcf_reasm_slot(tid, taskkey, 0);
    if (!s) return 0;
    if (!s->buf || s->len == 0){ memset(s, 0, sizeof(reasm_t)); return 0; }
    reasm_t* out = (reasm_t*)malloc(sizeof(reasm_t));
    if (!out){ memset(s, 0, sizeof(reasm_t)); return 0; }
    *out = *s;
    memset(s, 0, sizeof(reasm_t));
    return out;
}

/* v6.9: 锁外落盘 (open/mkdir/write — 全部 IO 不在持锁区) */
static void lcf_reasm_write_file(unsigned long long tid, int status,
                                 const char* mime, const char* buf, size_t len){
    const char* home = getenv("HOME");
    if (!home || !home[0]) return;
    char dir[512], path[600];
    snprintf(dir, sizeof(dir), "%s/" RESP_DIR_RELATIVE, home);
    mkdir(dir, 0755);   /* 已存在则 EEXIST, 无害 */
    const char* type = "bin";
    if (strstr(mime, "json")) type = "json";
    else if (strstr(mime, "html")) type = "html";
    else if (strstr(mime, "javascript")) type = "js";
    else if (strstr(mime, "xml")) type = "xml";
    else if (strstr(mime, "image")) type = "img";
    snprintf(path, sizeof(path), "%s/%llu-%d-%s.bin", dir, tid, status, type);
    /* v7.1: taskkey 哈希尾缀防 tid 复用覆盖 (同 tid 不同 task 的文件共存) */
    int fd = open(path, O_WRONLY | O_CREAT | O_TRUNC | O_CLOEXEC, 0644);
    if (fd >= 0){
        write(fd, buf, len);
        close(fd);
    }
}

/* ==================================================================
 * v6.0-A: resp 行 + fin 行 hook
 * ================================================================== */

/* NSHTTPURLResponse → resp 行 (tid 关联)
 * v6.1 安全修正: response 参数可能是 NSURLResponse 通用型 (非 HTTP),
 * 直接发 statusCode → doesNotRecognizeSelector → 崩 (v6.0 闪退根因)。
 * 判别: isKindOfClass(NSHTTPURLResponse) 才读 HTTP 专属字段。
 * 返回: line[0]==0 表示跳过
 * v6.2: 入口/出口标记 (前3次) — 闪退点定位 */
int g_diag_resp_enter = 0;
int g_diag_fin_enter = 0;
int g_diag_reasm_enter = 0;

static void lcf_resp_line(id self, id response, char* line, size_t cap){
    line[0] = 0;
    unsigned long long tid = (unsigned long long)(uintptr_t)objc_msgSend(self, s_tid);
    static Class httpRespCls = 0;
    if (!httpRespCls) httpRespCls = (Class)objc_getClass("NSHTTPURLResponse");
    SEL isk = sel_registerName("isKindOfClass:");
    char ishttp = 0;
    {
        typedef char (*boolmsg_t)(id, SEL, Class);
        ishttp = ((boolmsg_t)objc_msgSend)(response, isk, httpRespCls);
    }
    if (!ishttp) return;   /* 非 HTTP 响应 (file:// 等): 静默跳过 */
    long status = (long)(intptr_t)objc_msgSend(response, s_statusCode);
    id mime = (id)objc_msgSend(response, s_mime);
    char mimetype[48] = "";
    if (mime){
        const char* c = (const char*)objc_msgSend(mime, s_utf8);
        if (c) snprintf(mimetype, sizeof(mimetype), "%.40s", c);
    }
    /* 记录到重组槽 (fin 落盘时用) — v7.1 双键 */
    lc_lock();
    reasm_t* s = lcf_reasm_slot(tid, (unsigned long long)(uintptr_t)self, 1);
    if (s){ s->status = (int)status; snprintf(s->mime, sizeof(s->mime), "%.60s", mimetype); }
    lc_unlock();

    /* v6.7: encjson 段整体剥除 — allHeaderFields 是惰性求值深属性
     * (与 localizedDescription 同坑, v6.6 铁律), resp 行只留 status+mime
     * 浅层 selector。Content-Encoding 需求由 mime 字段近似覆盖 */
    (void)s_allHdr;
    char* p = line; size_t rem = cap;
    int w = snprintf(p, rem,
        "{\"ts\":%.3f,\"seq\":%llu,\"ev\":\"resp\",\"v\":\"" LCF_VERSION "\",\"tid\":%llu,\"status\":%ld,\"mime\":",
        lc_now(), ++g_seq, tid, status);
    p += w; rem -= (size_t)w;
    lc_json_str(&p, &rem, mimetype);
    snprintf(p, rem, ",\"pid\":%d}\n", (int)getpid());
}

static void didresp_hook(id self, SEL _cmd, id response, void* completion){
    if (g_orig_didresp && response){
        /* v6.2: enter 标记 (前3次) — 闪退点定位 */
        if (g_diag_resp_enter < 3){
            g_diag_resp_enter++;
            lc_stage("diag-resp-enter");
        }
        /* v6.1: 元数据提取绝不影响原请求流; line 置空跳过 */
        char line[512];
        lcf_resp_line(self, response, line, sizeof(line));
        if (line[0]){
            lc_lock(); lc_write_locked(line); lc_unlock();
        }
        if (g_diag_resp_enter == 3){
            g_diag_resp_enter = 4;
            lc_stage("diag-resp-survived");
        }
    }
    ((void(*)(id,SEL,id,void*))g_orig_didresp)(self, _cmd, response, completion);
}

/* v6.5: redirect 变体 hook — _onqueue_didReceiveResponse:redirectRequest:withCompletion: */
static void didresp2_hook(id self, SEL _cmd, id response, id redirectReq, void* completion){
    if (g_orig_didresp2 && response){
        if (g_diag_resp_enter < 3){
            g_diag_resp_enter++;
            lc_stage("diag-resp2-enter");
        }
        char line[512];
        lcf_resp_line(self, response, line, sizeof(line));
        if (line[0]){
            lc_lock(); lc_write_locked(line); lc_unlock();
        }
        if (g_diag_resp_enter == 3){
            g_diag_resp_enter = 4;
            lc_stage("diag-resp-survived");
        }
    }
    ((void(*)(id,SEL,id,id,void*))g_orig_didresp2)(self, _cmd, response, redirectReq, completion);
}

static void didfin_hook(id self, SEL _cmd, id error){
    if (g_orig_didfin){
        if (g_diag_fin_enter < 3){
            g_diag_fin_enter++;
            lc_stage("diag-fin-enter");
        }
        /* v6.6: fin 行【不碰 error 对象】—
         * v6.5 实锤: msgSend(error, localizedDescription) = 崩点
         * (v6.2-6.4 空壳不调它则稳, v6.0/6.5 调它则崩, 双 App 一致)
         * NSError 的 UserInfo 惰性求值在 LC guest 环境不安全。
         * state:err 只记 tid, 错误摘要放弃 */
        unsigned long long tid = (unsigned long long)(uintptr_t)objc_msgSend(self, s_tid);
        /* v6.8: status/mime 从 task.response 取 (公开属性, 浅层 selector) */
        long status = -1;
        long errcode = -1;
        char mimetype[40] = "";
        if (error){
            /* v7.1: error.code 浅层 selector (NSError @property, 非 UserInfo 深求值) */
            static SEL codeSel = 0;
            if (!codeSel) codeSel = sel_registerName("code");
            errcode = (long)(intptr_t)objc_msgSend(error, codeSel);
        }
        id resp = (id)objc_msgSend(self, s_response);
        if (resp){
            static Class httpRespCls = 0;
            if (!httpRespCls) httpRespCls = (Class)objc_getClass("NSHTTPURLResponse");
            SEL isk = sel_registerName("isKindOfClass:");
            typedef char (*boolmsg_t)(id, SEL, Class);
            if (((boolmsg_t)objc_msgSend)(resp, isk, httpRespCls)){
                status = (long)(intptr_t)objc_msgSend(resp, s_statusCode);
                id mime = (id)objc_msgSend(resp, s_mime);
                if (mime){
                    const char* c = (const char*)objc_msgSend(mime, s_utf8);
                    if (c) snprintf(mimetype, sizeof(mimetype), "%.36s", c);
                }
            }
        }
        char line[384];
        snprintf(line, sizeof(line),
            "{\"ts\":%.3f,\"seq\":%llu,\"ev\":\"fin\",\"v\":\"" LCF_VERSION "\",\"tid\":%llu,\"state\":\"%s\",\"status\":%ld,\"errCode\":%ld,\"mime\":",
            lc_now(), ++g_seq, tid, error ? "err" : "ok", status, errcode);
        {
            char* p2 = line + strlen(line);
            size_t rem2 = sizeof(line) - strlen(line);
            lc_json_str(&p2, &rem2, mimetype);
            snprintf(p2, rem2, ",\"pid\":%d}\n", (int)getpid());
        }
        lc_lock();
        {
            char* seqpos = strstr(line, "\"seq\":");
            if (seqpos){
                unsigned long long v = ++g_seq;
                char rest[400];
                strcpy(rest, seqpos + 6 + 1);
                snprintf(seqpos + 6, sizeof(line) - (size_t)(seqpos + 6 - line), "%llu%s", v, rest);
            }
            lc_write_locked(line);
        }
        lc_unlock();

        /* v6.9: 重组 flush 移锁外 — 持锁区只做"摘槽"(浅层指针交换),
         * open/mkdir/write 全部在锁外执行 (铁律: 持锁区只调 *_locked 变体) */
        lc_lock();
        reasm_t* slot = lcf_reasm_take_slot(tid, (unsigned long long)(uintptr_t)self);
        lc_unlock();
        if (slot){
            if (slot->buf && slot->len > 0){
                lcf_reasm_write_file(slot->tid, slot->status, slot->mime,
                                     slot->buf, slot->len);
            }
            if (slot->buf) free(slot->buf);
            free(slot);
        }

        if (g_diag_fin_enter == 3){
            g_diag_fin_enter = 4;
            lc_stage("diag-fin-survived");
        }
    }
    ((void(*)(id,SEL,id))g_orig_didfin)(self, _cmd, error);
}

/* ==================================================================
 * 探针 (幂等) 与数据 hook (含重组追加)
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
    s_curReq        = sel_registerName("currentRequest");
    s_allHdr        = sel_registerName("allHeaderFields");
    s_statusCode    = sel_registerName("statusCode");
    s_mime          = sel_registerName("MIMEType");
    s_localizedDesc = sel_registerName("localizedDescription");
    s_response     = sel_registerName("response");
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
        /* v6.8: connection:/redirect: 两个 resp hook 全部卸载 —
         * 实证: v6.2-6.4 hook connection: 零触发(稳), v6.5 起触发即崩
         * (status/mime 全浅层仍崩 → 崩在 hook 存在本身, 疑 CFNetwork
         *  非msgSend调用路径与C签名不匹配); redirect 变体从未触发。
         * 状态码改走 task 自身 response 属性 (零新hook面, 见 didfin_hook) */
        /* v6.0: fin 行 hook (探针名单 ●) */
        SEL df = sel_registerName("_onqueue_didFinishWithError:");
        m = class_getInstanceMethod(g_clsLocalTask, df);
        if (m){
            IMP old = method_getImplementation(m);
            if ((void*)old != (void*)didfin_hook){
                method_setImplementation(m, (IMP)didfin_hook);
                g_orig_didfin = old;
            }
        }
    }

    char tag[64];
    int n = (g_orig_dtwrh ? 1 : 0) + (g_orig_dtwr ? 1 : 0);
    snprintf(tag, sizeof(tag), "S3-hooked:%d", n);
    lc_stage(tag);
    lc_stage(g_orig_didd ? "S4-data-hooked" : "S4-data-miss");
    char tag2[48];
    int m2 = (g_orig_didresp ? 1 : 0) + (g_orig_didresp2 ? 1 : 0) + (g_orig_didfin ? 1 : 0);
    snprintf(tag2, sizeof(tag2), "S5-meta-hooked:%d", m2);
    lc_stage(tag2);
    lc_stage(g_resp_fallback ? DATA_FALLBACK_MARK : "resp-file-ok");
}
