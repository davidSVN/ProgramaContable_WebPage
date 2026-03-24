import os

FILES = [
    (r"frontend\src\components\ui\PrintInvoice.jsx", [
        ("          {orderData.order_id}", "          {orderData.order_number ?? orderData.order_id}")
    ]),
    (r"frontend\src\components\sections\NuevaOrden.jsx", [
        ("const orderNum = result?.order_id ?? result?.id ?? '—';", "const orderNum = result?.order_number ?? result?.order_id ?? result?.id ?? '—';")
    ]),
    (r"frontend\src\components\sections\ordenes\GastosNegocio.jsx", [
        ("<strong>#{g.order_id}</strong>", "<strong>#{g.order_number ?? g.order_id}</strong>")
    ]),
    (r"frontend\src\components\sections\ordenes\ServiciosAgencia.jsx", [
        ("<span className=\"sa-order-id\">#{s.order_id}</span>", "<span className=\"sa-order-id\">#{s.order_number ?? s.order_id}</span>")
    ]),
    (r"frontend\src\components\sections\ordenes\ServiciosPorOrdenes.jsx", [
        ("<span className=\"spo-order-id\">#{row.order_id}</span>", "<span className=\"spo-order-id\">#{row.order_number ?? row.order_id}</span>")
    ]),
    (r"frontend\src\components\sections\ordenes\HistorialOrdenes.jsx", [
        ("Te contactamos por la orden #${order.id}", "Te contactamos por la orden #${order.order_number ?? order.id}"),
        ("`Orden #${order.id} —", "`Orden #${order.order_number ?? order.id} —"),
        ("<h2 className=\"ho-drawer-title\">Orden #{drawerOrder.id}</h2>", "<h2 className=\"ho-drawer-title\">Orden #{drawerOrder.order_number ?? drawerOrder.id}</h2>"),
        ("<h3 className=\"ho-modal-title\">Editar Orden #{editOrder.id}</h3>", "<h3 className=\"ho-modal-title\">Editar Orden #{editOrder.order_number ?? editOrder.id}</h3>"),
        ("<span className=\"ho-eoc-id\">Orden #{selectedDeliveryOrder.id}</span>", "<span className=\"ho-eoc-id\">Orden #{selectedDeliveryOrder.order_number ?? selectedDeliveryOrder.id}</span>")
    ]),
    (r"frontend\src\components\sections\ordenes\B2BOrdenes.jsx", [
        ("<span className=\"b2b-order-id\">#{o.order_id}</span>", "<span className=\"b2b-order-id\">#{o.order_number ?? o.order_id}</span>")
    ]),
    (r"frontend\src\components\sections\Instituciones.jsx", [
        ("#{o.order_id}</td>", "#{o.order_number ?? o.order_id}</td>")
    ])
]

count = 0
for rel_path, replacements in FILES:
    abs_path = os.path.join(r"c:\Users\david.vasquez\Documents\personal\lavanderia\lavalatu-api", rel_path)
    if not os.path.exists(abs_path):
        print(f"Skipping {abs_path}")
        continue
    with open(abs_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    modified = False
    for old, new in replacements:
        if old in content:
            content = content.replace(old, new)
            modified = True
        
    if modified:
        with open(abs_path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Patched {rel_path}")
        count += 1

print(f"Total files patched: {count}")
