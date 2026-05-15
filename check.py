import sqlite3
conn = sqlite3.connect('dashboard_bastos.db')
for r in conn.execute("SELECT name FROM sqlite_master WHERE type IN ('table','view')").fetchall():
    print(r[0])
