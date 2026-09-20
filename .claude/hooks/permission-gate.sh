#!/bin/bash
# TopTouge 权限门禁 —— 第一层：确定性规则 + 累计写入计数
#
# 输入：Claude Code 通过 stdin 传入的 hook JSON
# 输出：{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask|allow",
#        "permissionDecisionReason":"..."}}
#
# 决策优先级由 Claude Code 在钩子之间仲裁：deny > ask > allow。
# 本脚本只产出 ask / allow；deny 由 settings.json 的 permissions.deny 硬保证。
#
# 设计说明：
#  - 累计写入计数是"跨调用"状态，agent 型钩子每次只能看到单个调用，做不到，故放在这一层
#  - 只读操作直接放行，不做任何判断，避免无谓的弹窗

set -uo pipefail

STATE_DIR="${TMPDIR:-/tmp}/toptouge-hook"
COUNTER_FILE="$STATE_DIR/write-count"
THRESHOLD="${TOPTOUGE_WRITE_THRESHOLD:-50}"   # 累计写入阈值，可用环境变量覆盖

input=$(cat)

if ! command -v jq >/dev/null 2>&1; then
  echo "jq 未安装，门禁钩子无法工作" >&2
  exit 0   # 放行，避免把整条链路堵死
fi

tool=$(printf '%s' "$input" | jq -r '.tool_name // ""')

emit() {
  local decision="$1" reason="$2"
  jq -nc --arg d "$decision" --arg r "$reason" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:$d,permissionDecisionReason:$r}}'
}

# ---------- 只读工具：直接放行 ----------
case "$tool" in
  Read|Glob|Grep|Task|TaskOutput|WebSearch|TodoWrite|TaskCreate|TaskUpdate|TaskList|TaskGet|NotebookRead)
    emit allow "只读操作"
    exit 0
    ;;
esac

case "$tool" in
  Write|Edit|MultiEdit)
    fp=$(printf '%s' "$input" | jq -r '.tool_input.file_path // ""')

    # 项目内配置文件 / 文档：自动放行，不计数
    case "$fp" in
      *.md|*.json|*.yml|*.yaml|*.toml|*.env.example|*.gitignore|*.sql)
        emit allow "配置或文档文件"
        exit 0
        ;;
    esac

    mkdir -p "$STATE_DIR" 2>/dev/null || true
    n=0
    [ -f "$COUNTER_FILE" ] && n=$(cat "$COUNTER_FILE" 2>/dev/null || echo 0)
    n=$(( n + 1 ))
    printf '%s' "$n" > "$COUNTER_FILE" 2>/dev/null || true

    if [ "$n" -gt "$THRESHOLD" ]; then
      emit ask "本 session 累计写入 $n 个文件，已超过阈值 ${THRESHOLD}。请确认是否继续批量修改。"
    else
      emit allow "第 $n 个文件写入（阈值 ${THRESHOLD}）"
    fi
    exit 0
    ;;
esac

case "$tool" in
  Bash)
    cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // ""')

    # ---------- 硬拦：批量删改 / 大下载 / 代码执行 ----------
    # 用 grep -E 逐条匹配，便于后续增删规则
    if printf '%s' "$cmd" | grep -qiE '(^|[;&|] *)rm[[:space:]]+-[a-z]*r'; then
      emit ask "递归删除（rm -r）请确认"
    elif printf '%s' "$cmd" | grep -qiE '(^|[;&|] *)(git[[:space:]]+clone|npm[[:space:]]+(install|i|ci)|pnpm[[:space:]]+(install|add)|yarn[[:space:]]+(add|install)|pip[[:space:]]+install|pip3[[:space:]]+install|brew[[:space:]]+install|docker[[:space:]]+pull|go[[:space:]]+get|cargo[[:space:]]+install)'; then
      emit ask "依赖安装或仓库克隆会产生大量文件，请确认"
    elif printf '%s' "$cmd" | grep -qiE '(^|[;&|] *)(git[[:space:]]+(clean|reset[[:space:]]+--hard)|find[[:space:]].*-delete)'; then
      emit ask "批量清理或回滚操作，可能丢失未提交内容，请确认"
    elif printf '%s' "$cmd" | grep -qiE '(^|[;&|] *)(curl|wget)[^|]*(-O|-o|--output)'; then
      emit ask "下载文件到本地，请确认来源"
    elif printf '%s' "$cmd" | grep -qiE '(^|[;&|] *)(sed[[:space:]]+-i|perl[[:space:]]+-i|truncate[[:space:]])'; then
      emit ask "原地批量改写文件，请确认范围"
    elif printf '%s' "$cmd" | grep -qiE '(proxy_provider|exec[[:space:]]+python|bash[[:space:]]+<(\(|/)|eval[[:space:]])'; then
      emit ask "动态代码执行，请确认"
    else
      emit allow "未命中风险规则"
    fi
    exit 0
    ;;
esac

# 其他工具（WebFetch 等）不表态，交给 Claude Code 正常权限流程
exit 0
