import sqlite3

try:
    conn = sqlite3.connect('lavalatu_db.sqlite')
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, subtotal, discount, total_amount, spent_per_order, net_income_value 
        FROM orders 
        ORDER BY id DESC LIMIT 5;
    """)
    rows = cursor.fetchall()
    print("id | subtotal | discount | total_amount | spent_per_order | net_income_value")
    for r in rows:
        print(r)
except Exception as e:
    print("Error:", e)
