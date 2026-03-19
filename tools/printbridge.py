import sys, os, json, base64, io, win32print
from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image

app = Flask(__name__)
CORS(app)

BASE = os.path.dirname(sys.executable if getattr(sys,'frozen',False) else __file__)
CONFIG = os.path.join(BASE, 'printbridge_config.json')

WIDTH = 48
LOGO_WIDTH = 25 # Ajusta este valor para cambiar el tamaño del logo (en píxeles)
ESC=b'\x1b'; GS=b'\x1d'
INIT=ESC+b'@'; CENTER=ESC+b'a\x01'; LEFT=ESC+b'a\x00'
BOLD_ON=ESC+b'E\x01'; BOLD_OFF=ESC+b'E\x00'
BIG_ON=ESC+b'!\x30'; BIG_OFF=ESC+b'!\x00'
FEED3=ESC+b'd\x03'; CUT=GS+b'V\x41\x00'

def cfg():
    try: return json.load(open(CONFIG))
    except: return {'printer_name': None}

def printer(): return cfg().get('printer_name') or win32print.GetDefaultPrinter()

def t(s):
    try: return s.encode('cp858')
    except: return s.encode('ascii','replace')

def money(v):
    n=round(float(v or 0))
    return f"${n:,.0f}".replace(',','.')

def logo_bytes(b64, max_w=LOGO_WIDTH):
    img=Image.open(io.BytesIO(base64.b64decode(b64.split(',')[1]))).convert('L')
    r=max_w/img.width
    img=img.resize((max_w,int(img.height*r)),Image.LANCZOS).convert('1')
    wb=(img.width+7)//8; px=list(img.getdata())
    out=bytearray(GS+b'v0\x00'+bytes([wb%256,wb//256,img.height%256,img.height//256]))
    # White background 512px exact
    bg_w = 512
    wb_bg = (bg_w+7)//8
    out = bytearray(GS+b'v0\x00'+bytes([wb_bg%256,wb_bg//256,img.height%256,img.height//256]))
    
    # Center the image in 512px
    offset = (bg_w - img.width) // 2
    for row in range(img.height):
        # Create a full row of 512 bits (64 bytes)
        row_data = [0] * wb_bg
        for col in range(img.width):
            if px[row*img.width + col] == 0:
                target_col = col + offset
                byte_idx = target_col // 8
                bit_idx = 7 - (target_col % 8)
                row_data[byte_idx] |= (1 << bit_idx)
        for b in row_data:
            out.append(b)
    return bytes(out)

def build(neg, ord):
    d=bytearray(INIT)
    if neg.get('logo_base64'):
        try: d+=CENTER+logo_bytes(neg['logo_base64'])+b'\n'
        except: pass
    d+=CENTER+BIG_ON+BOLD_ON+t((neg.get('nombre','LAVANDERIA')).upper()+'\n')+BIG_OFF+BOLD_OFF
    for k in ['slogan','direccion']:
        if neg.get(k): d+=t(neg[k]+'\n')
    if neg.get('nit'): d+=t(f"NIT: {neg['nit']}\n")
    d+=b'-'*WIDTH+b'\n'
    if neg.get('telefono'):
        d+=CENTER+BOLD_ON+t('DOMICILIOS / CONTACTO\n'+neg['telefono']+'\n')+BOLD_OFF+b'-'*WIDTH+b'\n'
    d+=CENTER+BOLD_ON+t(f"ORDEN #{ord.get('numero','0')}\n")+BOLD_OFF+b'\n'
    d+=CENTER+t('Cliente\n')+BOLD_ON+t(str(ord.get('cliente','')).upper()[:WIDTH]+'\n')+BOLD_OFF+LEFT
    if ord.get('telefono_cliente'): d+=t(f"Tel: {ord['telefono_cliente']}\n")
    d+=t(f"Fecha: {ord.get('fecha','')}\n")+b'-'*WIDTH+b'\n'
    
    # ── ITEMS SECTION — edit spaces manually here ────────────────────────────
    # Each row uses: cant(fixed) + spaces + detalle(truncated) + spaces + vunit + spaces + vtotal
    # Adjust the spaces in the strings below to align columns on your paper.

    d+=BOLD_ON+t("Cant  Detalle              V.Unit       V.Total\n")+BOLD_OFF
    d+=b'------------------------------------------------\n'

    pzs=0
    for item in ord.get('items',[]):
        c = int(item.get('cantidad', 1)); pzs += c
        cant    = str(c)
        detalle = str(item.get('detalle', ''))[:20]
        vunit   = money(item.get('vlr_unit', 0))
        vtotal  = money(item.get('vlr_total', 0))
        d+=t(f"{cant} {detalle:<20}       {vunit:>9}   {vtotal:>9}\n")

    d+=b'------------------------------------------------\n'
    d+=t(f"Total Pzs. {pzs}\n")
    d+=t(f"Subtotal:                    {money(ord.get('subtotal',0)):>9}\n")
    d+=t(f"Abono:                       {money(ord.get('abono',0)):>9}\n")
    d+=b'------------------------------------------------\n'+LEFT+BOLD_ON
    estado = str(ord.get('estado_pago','PENDIENTE'))[:20]
    d+=t(f"{estado}          {money(ord.get('total',0)):>9}\n")+BOLD_OFF
    
    d+=CENTER+b'\n'
    if neg.get('mensaje_pie'): d+=t(neg['mensaje_pie']+'\n')
    d+=b'-'*WIDTH+b'\n'+FEED3+CUT
    return bytes(d)

def send(data):
    p=win32print.OpenPrinter(printer())
    try:
        j=win32print.StartDocPrinter(p,1,('WashFlow',None,'RAW'))
        try: win32print.StartPagePrinter(p); win32print.WritePrinter(p,data); win32print.EndPagePrinter(p)
        finally: win32print.EndDocPrinter(p)
    finally: win32print.ClosePrinter(p)

@app.route('/status')
def status():
    try:
        return jsonify({'status':'online',
            'default_printer':win32print.GetDefaultPrinter(),
            'current_printer':cfg().get('printer_name') or win32print.GetDefaultPrinter(),
            'available_printers':[p[2] for p in win32print.EnumPrinters(2)]})
    except Exception as e: return jsonify({'status':'error','message':str(e)}),500

@app.route('/print', methods=['POST'])
def handle_print():
    try:
        b=request.get_json()
        rec=build(b.get('negocio',{}),b.get('orden',{}))
        for _ in range(int(b.get('copias',1))): send(rec)
        return jsonify({'status':'ok','printer':printer()})
    except Exception as e: return jsonify({'status':'error','message':str(e)}),500

@app.route('/configure', methods=['POST'])
def configure():
    json.dump({'printer_name':request.get_json().get('printer_name')},open(CONFIG,'w'))
    return jsonify({'status':'ok'})

@app.route('/test', methods=['POST'])
def test():
    try:
        neg=request.get_json() or {}
        ord={'numero':'0000','cliente':'CLIENTE PRUEBA',
             'telefono_cliente':'3100000000','fecha':'PRUEBA',
             'items':[{'cantidad':1,'detalle':'Prueba','vlr_unit':10000,'vlr_total':10000}],
             'subtotal':10000,'abono':0,'total':10000,'estado_pago':'PRUEBA'}
        send(build(neg,ord))
        return jsonify({'status':'ok','printer':printer()})
    except Exception as e: return jsonify({'status':'error','message':str(e)}),500

if __name__=='__main__':
    print(f"PrintBridge v2.0 — {win32print.GetDefaultPrinter()} — localhost:8765")
    app.run(host='127.0.0.1',port=8765,debug=False)
