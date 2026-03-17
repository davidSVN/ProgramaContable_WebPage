"""
WashFlow PrintBridge v1.0
Run locally on Windows PC with thermal printer connected via USB.
Start with: python printbridge.py
Listens on: http://localhost:8765
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
from escpos.printer import Win32Raw
from PIL import Image
import base64, io, json, sys, win32print

app = Flask(__name__)
CORS(app)

CONFIG_FILE = "printbridge_config.json"


def load_config():
    try:
        with open(CONFIG_FILE) as f:
            return json.load(f)
    except Exception:
        return {"printer_name": None}


def get_printer():
    config = load_config()
    name = config.get("printer_name") or win32print.GetDefaultPrinter()
    return Win32Raw(name)


def fmt_money(value):
    """Format number as Colombian pesos: 45.000"""
    return f"{int(value):,}".replace(",", ".")


def print_receipt(negocio: dict, orden: dict):
    p = get_printer()
    p.open()

    try:
        # LOGO
        if negocio.get("logo_base64"):
            try:
                img_data = negocio["logo_base64"].split(",")[1]
                img_bytes = base64.b64decode(img_data)
                img = Image.open(io.BytesIO(img_bytes)).convert("L")
                ratio = 384 / img.width
                img = img.resize((384, int(img.height * ratio)), Image.LANCZOS)
                p.set(align="center")
                p.image(img, impl="bitImageRaster")
            except Exception:
                pass

        # HEADER
        p.set(align="center", bold=True, double_width=True, double_height=True)
        p.text(f"{negocio.get('nombre', 'LAVANDERIA')}\n")
        p.set(align="center", bold=False, double_width=False, double_height=False)
        if negocio.get("slogan"):
            p.text(f"{negocio['slogan']}\n")
        if negocio.get("direccion"):
            p.text(f"{negocio['direccion']}\n")
        if negocio.get("nit"):
            p.text(f"NIT: {negocio['nit']}\n")

        p.text("-" * 32 + "\n")

        # CONTACT
        if negocio.get("telefono"):
            p.set(align="center", bold=True)
            p.text("DOMICILIOS / CONTACTO\n")
            p.text(f"{negocio['telefono']}\n")
            p.text("-" * 32 + "\n")

        # ORDER NUMBER
        p.set(align="center", bold=True)
        p.text(f"ORDEN #{orden['numero']}\n\n")

        # CLIENT
        p.set(align="center", bold=False)
        p.text("Cliente\n")
        p.set(align="center", bold=True)
        p.text(f"{orden['cliente'].upper()}\n")
        p.set(align="left", bold=False)
        if orden.get("telefono_cliente"):
            p.text(f"Telefono : {orden['telefono_cliente']}\n")
        p.text(f"Fecha    : {orden['fecha']}\n")
        p.text("-" * 32 + "\n")

        # ITEMS HEADER
        p.set(bold=True)
        p.text(f"{'Cant':<5}{'Detalle':<15}{'V.Unit':>6}{'V.Tot':>6}\n")
        p.set(bold=False)
        p.text("-" * 32 + "\n")

        # ITEMS
        total_pzs = 0
        for item in orden.get("items", []):
            cant = int(item["cantidad"])
            total_pzs += cant
            detalle = str(item["detalle"])[:14]
            vlr_u = fmt_money(item["vlr_unit"])
            vlr_t = fmt_money(item["vlr_total"])
            p.text(f"{cant:<5}{detalle:<14}{vlr_u:>7}{vlr_t:>6}\n")

        p.text("-" * 32 + "\n")

        # TOTALS
        p.text(f"Total Pzs. {total_pzs}\n")
        p.set(align="right")
        p.text(f"Subtotal:  {fmt_money(orden['subtotal'])}\n")
        p.text(f"Abono:     {fmt_money(orden.get('abono', 0))}\n")
        p.text("-" * 32 + "\n")
        p.set(align="left", bold=True)
        estado = orden.get("estado_pago", "PENDIENTE")
        p.text(f"{estado:<20}{fmt_money(orden['total'])}\n")

        # FOOTER
        p.set(align="center", bold=False)
        p.text("\n")
        if negocio.get("mensaje_pie"):
            p.text(f"{negocio['mensaje_pie']}\n")
        p.text("\n\n\n")
        p.cut()

    finally:
        p.close()


@app.route("/print", methods=["POST"])
def handle_print():
    try:
        data = request.get_json()
        negocio = data.get("negocio", {})
        orden = data.get("orden", {})
        copias = int(data.get("copias", 1))
        for _ in range(copias):
            print_receipt(negocio, orden)
        return jsonify({"status": "ok", "copias": copias})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/status", methods=["GET"])
def status():
    try:
        default = win32print.GetDefaultPrinter()
        printers = [p[2] for p in win32print.EnumPrinters(2)]
        return jsonify({
            "status": "online",
            "default_printer": default,
            "available_printers": printers,
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/configure", methods=["POST"])
def configure():
    data = request.get_json()
    with open(CONFIG_FILE, "w") as f:
        json.dump({"printer_name": data.get("printer_name")}, f)
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    print("=" * 50)
    print("  WashFlow PrintBridge v1.0")
    print("  Servidor de impresion termica")
    print("=" * 50)
    try:
        default = win32print.GetDefaultPrinter()
        print(f"\n  Impresora detectada: {default}")
        print(f"  Servidor listo en: http://localhost:8765")
        print("\n  MANTEN ESTA VENTANA ABIERTA")
        print("  Para detener: Ctrl+C")
        print("=" * 50 + "\n")
    except Exception as e:
        print(f"\n  ERROR: No se detecto impresora: {e}")
        print("  Verifica que la impresora este conectada")
        print("=" * 50 + "\n")
    app.run(host="127.0.0.1", port=8765, debug=False)
