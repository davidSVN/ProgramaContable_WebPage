"""
send_resume_to_user.py
──────────────────────
Módulo para imprimir (y en el futuro enviar) el resumen de una orden
al cliente correspondiente.

FUNCIÓN PÚBLICA
───────────────
· imprimir_recibo_termico(orden, servicios_data, subtotal)
    → Imprime el recibo físicamente en la impresora POS.
"""
import sys
import os


def imprimir_recibo_termico(orden, servicios_data: list, subtotal: float) -> bool:
    """Imprime el recibo de la orden físicamente en formato de factura usando la POS."""
    try:
        import win32print
        from escpos.printer import Dummy
        import os
    except ImportError:
        print(">>> [PRINTER] Falta 'win32print' o 'python-escpos'")
        return False

    # Intentar obtener el nombre de la impresora y datos del negocio de la base de datos
    try:
        # Import robusto para dev y para el .exe generado con PyInstaller
        # En el .exe, el sys.path puede no incluir la raíz del proyecto.
        _root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if _root not in sys.path:
            sys.path.insert(0, _root)
        from app.crud import get_session, get_setting
        with get_session() as db:
            printer_name = get_setting(db, "thermal_printer_name", "POS-80-Series")
            biz_name     = get_setting(db, "business_name",        "LAVALATU")
            biz_slogan1  = get_setting(db, "business_slogan_1",    "SI NO TIENES TIEMPO")
            biz_slogan2  = get_setting(db, "business_slogan_2",    "LO HACEMOS POR TI")
            biz_address  = get_setting(db, "business_address",     "Calle 163a #14b-25")
            biz_phone    = get_setting(db, "business_phone",       "3106697376")
            biz_footer   = get_setting(db, "business_footer",      "LAS ANOTACIONES MANUALES\nNO TENDRAN VALIDEZ")
    except Exception:
        printer_name = "POS-80-Series"
        biz_name, biz_slogan1, biz_slogan2 = "LAVALATU", "SI NO TIENES TIEMPO", "LO HACEMOS POR TI"
        biz_address, biz_phone, biz_footer = "Calle 163a #14b-25", "3106697376", "LAS ANOTACIONES MANUALES\nNO TENDRAN VALIDEZ"

    try:
        hprinter = win32print.OpenPrinter(printer_name)
    except Exception:
        print(f">>> [PRINTER ERROR] No se pudo abrir la impresora '{printer_name}'")
        return False

    try:
        # Iniciar trabajo de impresión RAW (crudo)
        job = win32print.StartDocPrinter(hprinter, 1, (f"Recibo {biz_name}", None, "RAW"))
        win32print.StartPagePrinter(hprinter)
        
        # ── Resolver capabilities.json compatible con dev y PyInstaller ──
        # En el .exe, sys._MEIPASS apunta a la carpeta temporal donde están los datos.
        # En dev, se resuelve desde el paquete instalado.
        if getattr(sys, 'frozen', False):
            _cap_path = os.path.join(sys._MEIPASS, 'escpos', 'capabilities.json')
        else:
            try:
                import escpos as _escpos_pkg
                _cap_path = os.path.join(os.path.dirname(_escpos_pkg.__file__), 'capabilities.json')
            except Exception:
                _cap_path = None

        if _cap_path and os.path.exists(_cap_path):
            os.environ.setdefault('ESCPOS_CAPABILITIES', _cap_path)

        p = Dummy(profile="TM-T88II")
        p.hw("INIT")
        
        # Obtener ruta base para recursos (funciona en dev y PyInstaller)
        if getattr(sys, 'frozen', False):
            base_path_res = sys._MEIPASS
        else:
            base_path_res = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

            
        img_logo = os.path.join(base_path_res, "media", "logo y titulo.png")
        
        p.set(align="center")
        if os.path.exists(img_logo):
            from PIL import Image
            with Image.open(img_logo) as img:
                img = img.convert("RGBA")
                basewidth = 500
                wpercent = (basewidth / float(img.size[0]))
                hsize = int((float(img.size[1]) * float(wpercent)))
                img_resized = img.resize((basewidth, hsize), Image.Resampling.LANCZOS)
                
                # Fondo blanco de 512px exactos de la pos 80mm
                bg = Image.new("RGB", (512, hsize), (255, 255, 255))
                bg.paste(img_resized, ((512 - basewidth) // 2, 0), img_resized)
                p.image(bg)
        
        # Cabecera Dinámica
        p.set(align="center", bold=True)
        p.text(f"{biz_name}\n")
        p.set(bold=False)
        p.text(f"{biz_slogan1}\n")
        p.text(f"{biz_slogan2}\n")
        p.text(f"{biz_address}\n")
        p.text("────────────────────────────────────────────────\n")
        
        # Caja de Domicilios / Contacto
        p.set(align="center", bold=True)
        p.text("DOMICILIOS / CONTACTO\n")
        p.text(f"{biz_phone}\n")
        p.set(align="center", bold=False)
        p.text("────────────────────────────────────────────────\n\n")
        
        # Número de orden
        order_id = getattr(orden, "order_id", "N/A")
        # p.set(align="center", bold=True, double_width=True, double_height=True)
        p.text(f"ORDEN #{order_id}\n\n")
        
        # Restablecer y Cliente
        # p.set(align="center", bold=False, double_width=False, double_height=False)
        p.text("Cliente\n")
        user_name = getattr(orden, "user_name", "Desconocido").upper()
        p.set(align="center", bold=True)
        p.text(f"{user_name[:30]}\n")
        
        # Datos adicionales
        p.set(align="left", bold=False)
        p.text(f"Telefono  : {getattr(orden, 'user_contact', 'N/A')}\n")
        date_obj = getattr(orden, "created_at", None)
        fecha_str = date_obj.strftime("%a %d %b %Y %H:%M").upper() if date_obj else "N/A"
        p.text(f"Fecha     : {fecha_str}\n")
        
        linea_punteada_b = "────────────────────────────────────────────────\n"
        p.text(linea_punteada_b)
        p.text("Cant         Detalle         Vlr.Unit Vlr.Total\n")
        p.text(linea_punteada_b)
        
        total_qty = 0
        for i, sv in enumerate(servicios_data, start=1):
            qty   = sv.get("qty", 1)
            name  = sv.get("name", "")[:18]  
            value = sv.get("value", 0)
            total = qty * value
            total_qty += qty
            
            cp_detalle = f"{int(qty):>2} {name}"[:22]
            p.text(f"{cp_detalle:<22} {value:>12,.0f} {total:>12,.0f}\n")
           
        p.text(linea_punteada_b)
        line_sub = f"Total Pzs. {int(total_qty):<8}      Subtotal: {subtotal:>12,.0f}\n"
        p.text(line_sub)
        
        discount = getattr(orden, "discount_value", 0.0)
        if discount > 0:
            label_desc = "Desc. Fidelidad:" if discount == 7000.0 else "Descuento:      "
            p.text(f"                           {label_desc} {discount:>12,.0f}\n")
            
        abono = getattr(orden, "abono", 0.0)
        p.text(f"                           Abono: {abono:>12,.0f}\n")
        
        restante = getattr(orden, "restante", 0.0)
        p.set(align="left", bold=True)
        p.text(f"PENDIENTE CANCELAR                {restante:>12,.0f}\n")
        
        p.set(align="center", bold=False)
        p.text(linea_punteada_b)
        p.text(f"{biz_footer}\n")
        p.text(linea_punteada_b)
        p.text("\n\n\n")
        p.cut()
        
        # Se recogen los bytes procesados del POS
        win32print.WritePrinter(hprinter, p.output)
        
        win32print.EndPagePrinter(hprinter)
        win32print.EndDocPrinter(hprinter)
        return True

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f">>> [PRINTER ERROR] {e}")
        return False
        
    finally:
        win32print.ClosePrinter(hprinter)
