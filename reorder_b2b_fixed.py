import sys

file_path = "c:\\Users\\david.vasquez\\Documents\\personal\\lavanderia\\lavalatu-api\\frontend\\src\\components\\sections\\ordenes\\B2BOrdenes.jsx"

with open(file_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

block = lines[540:690]
lines = lines[:540] + lines[690:]

wa_idx = -1
for i, l in enumerate(lines):
    if "{/* ── WhatsApp Resumen ─────────────────────────────────────── */}" in l:
        wa_idx = i
        break

wa_end_idx = -1
c = 0
if wa_idx != -1:
    for i in range(wa_idx + 1, len(lines)):
        c += lines[i].count("<div")
        c -= lines[i].count("</div")
        if c < 0:
            wa_end_idx = i
            break

if wa_end_idx != -1:
    lines = lines[:wa_end_idx + 1] + ["\n"] + block + ["\n"] + lines[wa_end_idx + 1:]
    with open(file_path, "w", encoding="utf-8") as f:
        f.writelines(lines)
    print("Success! Inserted after", wa_end_idx)
else:
    print("Failed to find WA block")
