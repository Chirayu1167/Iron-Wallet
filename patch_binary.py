import pathlib
p=pathlib.Path("otp_server.py")
t=p.read_text(encoding="utf-8")
# Find the risk_assess return and add binary fields
old = '''    return JSONResponse(content={
        "score": final_score,
        "tier": tier,
        "confidence": round(float(overall_conf), 2),
        "signals": unified_signals,  # structured with contribution (Phase 6)'''
new = '''    # Binary fraud decision (separate from tier)
    try:
        binary_label = unified.get("fraud_label", "LEGITIMATE" if tier=="SAFE" else "FRAUDULENT")
        is_fraud = unified.get("is_fraudulent", unified.get("binary_fraud", tier in ("CAUTION","HIGH_RISK")))
    except:
        is_fraud = tier in ("CAUTION","HIGH_RISK")
        binary_label = "FRAUDULENT" if is_fraud else "LEGITIMATE"
    return JSONResponse(content={
        "score": final_score,
        "tier": tier,
        "confidence": round(float(overall_conf), 2),
        "signals": unified_signals,  # structured with contribution (Phase 6)
        "fraud_label": binary_label,
        "is_fraudulent": bool(is_fraud),
        "binary_fraud": bool(is_fraud)'''
if old in t:
    t=t.replace(old, new)
    print("patched risk_assess")
else:
    print("not found")
    # Try alternative
    import re
    # Find first occurrence
    idx=t.find('"score": final_score')
    print(t[idx-200:idx+500][:1000])

# Also patch transactions/prepare return to include binary
old2 = '''    return JSONResponse(content={
        "transaction_id": tx["transaction_id"],
        "risk": {
            "score": base_score,
            "tier": tier,
            "confidence": round(float(overall_conf) if \'overall_conf\' in locals() else float(s2.get("confidence",50))/100.0 if isinstance(s2.get("confidence"), (int,float)) and s2.get("confidence")>1 else float(s2.get("confidence",0.5)), 2),'''
new2 = '''    # Binary for prepare
    try:
        binary_label_prep = unified.get("fraud_label", "LEGITIMATE" if tier=="SAFE" else "FRAUDULENT") if 'unified' in locals() else ("FRAUDULENT" if tier in ("CAUTION","HIGH_RISK") else "LEGITIMATE")
        is_fraud_prep = binary_label_prep=="FRAUDULENT"
    except:
        is_fraud_prep = tier in ("CAUTION","HIGH_RISK")
        binary_label_prep = "FRAUDULENT" if is_fraud_prep else "LEGITIMATE"
    return JSONResponse(content={
        "transaction_id": tx["transaction_id"],
        "risk": {
            "score": base_score,
            "tier": tier,
            "confidence": round(float(overall_conf) if \'overall_conf\' in locals() else float(s2.get("confidence",50))/100.0 if isinstance(s2.get("confidence"), (int,float)) and s2.get("confidence")>1 else float(s2.get("confidence",0.5)), 2),
            "fraud_label": binary_label_prep,
            "is_fraudulent": bool(is_fraud_prep),'''
if old2 in t:
    t=t.replace(old2, new2)
    print("patched prepare")
else:
    print("prepare not found")

p.write_text(t, encoding="utf-8")
print("done")
