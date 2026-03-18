import sys, os, json, base64, io, win32print
from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image

app = Flask(__name__)
CORS(app)

BASE = os.path.dirname(sys.executable if getattr(sys,'frozen',False) else __file__)
CONFIG = os.path.join(BASE, 'printbridge_config.json')

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
    return f"${n:,}".replace(',','.')

def logo_bytes(b64, max_w=384):
    img=Image.open(io.BytesIO(base64.b64decode(b64.split(',')[1]))).convert('L')
    r=max_w/img.width
    img=img.resize((max_w,int(img.height*r)),Image.LANCZOS).convert('1')
    wb=(img.width+7)//8; px=list(img.getdata())
    out=bytearray(GS+b'v0\x00'+bytes([wb%256,wb//256,img.height%256,img.height//256]))
    for row in range(img.height):
        for col in range(0,img.width,8):
            b=0
            for bit in range(8):
                if col+bit<img.width and px[row*img.width+col+bit]==0:
                    b|=(1<<(7-bit))
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
    d+=b'-'*32+b'\n'
    if neg.get('telefono'):
        d+=CENTER+BOLD_ON+t('DOMICILIOS / CONTACTO\n'+neg['telefono']+'\n')+BOLD_OFF+b'-'*32+b'\n'
    d+=CENTER+BOLD_ON+t(f"ORDEN #{ord.get('numero','0')}\n")+BOLD_OFF+b'\n'
    d+=CENTER+t('Cliente\n')+BOLD_ON+t(ord.get('cliente','').upper()+'\n')+BOLD_OFF+LEFT
    if ord.get('telefono_cliente'): d+=t(f"Tel: {ord['telefono_cliente']}\n")
    d+=t(f"Fecha: {ord.get('fecha','')}\n")+b'-'*32+b'\n'
    d+=BOLD_ON+t(f"{'Cant':<5}{'Detalle':<15}{'V.Unit':>6}{'V.Tot':>6}\n")+BOLD_OFF+b'-'*32+b'\n'
    pzs=0
    for item in ord.get('items',[]):
        c=int(item.get('cantidad',1)); pzs+=c
        d+=t(f"{c:<5}{str(item.get('detalle',''))[:14]:<14}{money(item.get('vlr_unit',0)):>7}{money(item.get('vlr_total',0)):>6}\n")
    d+=b'-'*32+b'\n'+t(f"Total Pzs. {pzs}\n")
    d+=t(f"Subtotal: {money(ord.get('subtotal',0))}\nAbono:    {money(ord.get('abono',0))}\n")
    d+=b'-'*32+b'\n'+LEFT+BOLD_ON
    d+=t(f"{str(ord.get('estado_pago','PENDIENTE'))[:18]:<18}{money(ord.get('total',0)):>10}\n")+BOLD_OFF
    d+=CENTER+b'\n'
    if neg.get('mensaje_pie'): d+=t(neg['mensaje_pie']+'\n')
    d+=FEED3+CUT
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
