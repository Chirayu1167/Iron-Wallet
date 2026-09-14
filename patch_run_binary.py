import pathlib
p=pathlib.Path("run_binary_500.py")
t=p.read_text(encoding="utf-8")
old = '''        else:
            j=r.json()
            pred_tier=j.get("tier","SAFE")
            score=j.get("score",0)
            # Binary decision: currently CAUTION+HIGH_RISK = FRAUDULENT (as per old)
            # But new spec says binary should be independent, not just tier. For now use tier mapping.
            pred_bin="FRAUDULENT" if pred_tier in ("CAUTION","HIGH_RISK") else "LEGITIMATE"
            # TODO: implement proper binary classifier separate from tier'''
new = '''        else:
            j=r.json()
            pred_tier=j.get("tier","SAFE")
            score=j.get("score",0)
            # Use explicit binary fraud decision from RiskEngine (separate from tier)
            if "is_fraudulent" in j:
                pred_bin="FRAUDULENT" if j.get("is_fraudulent") else "LEGITIMATE"
            elif "fraud_label" in j:
                pred_bin=j.get("fraud_label","LEGITIMATE")
            else:
                pred_bin="FRAUDULENT" if pred_tier in ("CAUTION","HIGH_RISK") else "LEGITIMATE"'''
if old in t:
    t=t.replace(old, new)
    print("patched")
else:
    print("not found")
p.write_text(t, encoding="utf-8")
print("done")
