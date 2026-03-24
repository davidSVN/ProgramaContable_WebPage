import sys

file_path = "c:\\Users\\david.vasquez\\Documents\\personal\\lavanderia\\lavalatu-api\\frontend\\src\\components\\sections\\ordenes\\B2BOrdenes.jsx"

with open(file_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

# Locate start
start_idx = -1
for i, line in enumerate(lines):
    if "{/* ── Grid: Abono + Pago Factura ─────────────────────────────── */}" in line:
        start_idx = i
        break

# Locate end
end_idx = -1
counter = 0
for i in range(start_idx + 1, len(lines)):
    line = lines[i]
    if "<div " in line or "<div" in line:
        counter += line.count("<div")
    if "</div" in line:
        counter -= line.count("</div")
        if counter < 0:
            end_idx = i
            break

print("Start:", start_idx, "End:", end_idx)

if start_idx != -1 and end_idx != -1:
    block = lines[start_idx:end_idx+1]
    
    # Locate insertion point which is the WhatsApp Bar </div>
    wa_start = -1
    for i, line in enumerate(lines):
        if "{/* ── WhatsApp Resumen ─────────────────────────────────────── */}" in line:
            wa_start = i
            break
            
    wa_end = -1
    c = 0
    for i in range(wa_start+1, len(lines)):
        if "<div" in lines[i]:
            c += lines[i].count("<div")
        if "</div" in lines[i]:
            c -= lines[i].count("</div")
            if c < 0:
                wa_end = i
                break
                
    print("WA Start:", wa_start, "WA End:", wa_end)
    
    if wa_end != -1:
        # Move block from original place to after wa_end
        # Need to be careful mapping original indices since we remove lines
        new_lines = lines[:start_idx] + lines[end_idx+1:]
        
        # Recalculate wa_end in new_lines
        wa_start_new = -1
        for i, line in enumerate(new_lines):
            if "{/* ── WhatsApp Resumen ─────────────────────────────────────── */}" in line:
                wa_start_new = i
                break
                
        wa_end_new = -1
        c = 0
        for i in range(wa_start_new+1, len(new_lines)):
            if "<div" in new_lines[i]:
                c += new_lines[i].count("<div")
            if "</div" in new_lines[i]:
                c -= new_lines[i].count("</div")
                if c < 0:
                    wa_end_new = i
                    break
        
        print("Inserting after:", wa_end_new)
        final_lines = new_lines[:wa_end_new+1] + ["\n"] + block + new_lines[wa_end_new+1:]
        
        with open(file_path, "w", encoding="utf-8") as f:
            f.writelines(final_lines)
        print("Success!")
