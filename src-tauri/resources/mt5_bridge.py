"""MERIDIAN · MetaTrader 5 bridge.

读取本机 MT5 终端的账户信息、历史成交、历史订单与当前持仓，把结果以 JSON
写到 stdout。由 MERIDIAN 桌面版的 Rust 命令 mt5_sync 调用；也可以手工运行排查：

    py -3 mt5_bridge.py --from 2026-10-01 --to 2026-11-10

脚本只读取数据，不修改终端、不写文件；凭据只在内存中使用。
"""

import argparse
import datetime as dt
import json
import sys


def emit(payload):
    print(json.dumps(payload, ensure_ascii=False, default=str))
    sys.exit(0)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--from", dest="date_from", required=True)
    parser.add_argument("--to", dest="date_to", required=True)
    parser.add_argument("--terminal", default="")
    parser.add_argument("--login", default="")
    parser.add_argument("--server", default="")
    parser.add_argument("--password", default="")
    parser.add_argument("--pad-days", type=int, default=30)
    args = parser.parse_args()

    try:
        import MetaTrader5 as mt5
    except Exception as exc:  # 包未安装或位数不匹配
        emit(
            {
                "ok": False,
                "error": "MISSING_PACKAGE",
                "message": "未安装 MetaTrader5 Python 包：%s" % exc,
            }
        )

    # 向前多取一段，覆盖开仓早于区间、平仓落在区间内的持仓。
    try:
        start = dt.datetime.strptime(args.date_from, "%Y-%m-%d").replace(
            tzinfo=dt.timezone.utc
        ) - dt.timedelta(days=max(0, args.pad_days))
        end = dt.datetime.strptime(args.date_to, "%Y-%m-%d").replace(
            tzinfo=dt.timezone.utc
        ) + dt.timedelta(days=1)
    except ValueError:
        emit({"ok": False, "error": "BAD_DATE", "message": "日期格式应为 YYYY-MM-DD"})

    init_kwargs = {}
    if args.terminal:
        init_kwargs["path"] = args.terminal
    if args.login:
        try:
            init_kwargs["login"] = int(args.login)
        except ValueError:
            emit({"ok": False, "error": "BAD_LOGIN", "message": "MT5 账号必须是数字"})
    if args.server:
        init_kwargs["server"] = args.server
    if args.password:
        init_kwargs["password"] = args.password

    if not mt5.initialize(**init_kwargs):
        code, message = mt5.last_error()
        if code == -6:
            hint = (
                "MT5 终端未登录或登录已失效（Authorization failed）。"
                "请先在 MT5 里登录账户，或展开「指定 MT5 账号登录」填写账号与密码后重试。"
            )
        else:
            hint = "无法连接 MT5 终端：%s（%s）。请确认 MT5 已安装并已登录。" % (message, code)
        emit({"ok": False, "error": "INIT_FAILED", "message": hint})

    try:
        account = mt5.account_info()
        deals = mt5.history_deals_get(start, end) or []
        orders = mt5.history_orders_get(start, end) or []
        positions = mt5.positions_get() or []
        payload = {
            "ok": True,
            "account": dict(account._asdict()) if account else None,
            "deals": [dict(item._asdict()) for item in deals],
            "orders": [dict(item._asdict()) for item in orders],
            "positions": [dict(item._asdict()) for item in positions],
            "range": {
                "from": args.date_from,
                "to": args.date_to,
                "paddedFrom": start.strftime("%Y-%m-%d"),
            },
        }
        emit(payload)
    finally:
        mt5.shutdown()


if __name__ == "__main__":
    main()
