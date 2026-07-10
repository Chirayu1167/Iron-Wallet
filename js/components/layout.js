/* ═══ FLOATING BOTTOM DOCK (macOS-Dock style) ═══ */
function Dock({page, setPage, onLogout, pendingCount}) {
  const NAV = [
    { id: "dashboard",     label: "Dashboard",     icon: Ic.home,  isNav: true  },
    { id: "send",          label: "Send Money",    icon: Ic.send,  isNav: true  },
    { id: "request-money", label: "Request Money", icon: Ic.rupee, isNav: true  },
    { id: "requests",      label: "Pay Requests",  icon: Ic.bell,  isNav: true, badge: pendingCount },
    { id: "history",       label: "History",       icon: Ic.clock, isNav: true  },
    { id: "profile",       label: "Profile",       icon: Ic.user,  isNav: true  },
  ];

  const [narrow, setNarrow] = React.useState(
    typeof window !== "undefined" ? window.innerWidth <= 768 : false
  );
  React.useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth <= 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div className="dock-pill" role="navigation" aria-label="Primary"
      style={{
        position: "fixed",
        bottom: narrow ? 12 : 18,
        left: narrow ? 12 : "50%",
        right: narrow ? 12 : "auto",
        transform: narrow ? "none" : "translateX(-50%)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        gap: narrow ? 2 : 4,
        padding: narrow ? "8px 6px" : "8px 10px",
        background: "rgba(255,255,255,0.72)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        border: "1px solid rgba(255,255,255,0.55)",
        borderRadius: narrow ? 22 : 28,
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.6), 0 12px 40px rgba(15,30,46,0.18), 0 2px 6px rgba(15,30,46,0.08)",
        fontFamily: "'Inter', sans-serif",
        maxWidth: narrow ? "none" : "min(720px, calc(100vw - 32px))",
      }}
    >
      {NAV.map((n) => {
        const active = page === n.id;
        return (
          <button
            key={n.id}
            onClick={() => setPage(n.id)}
            title={n.label}
            className={`dock-item ${active ? "active" : ""}`}
            style={{
              display: "flex",
              flexDirection: narrow ? "column" : "row",
              alignItems: "center",
              justifyContent: "center",
              gap: narrow ? 3 : 0,
              width: narrow ? "auto" : 56,
              height: narrow ? "auto" : 56,
              minWidth: narrow ? 0 : 56,
              padding: narrow ? "6px 10px" : 0,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              borderRadius: narrow ? 12 : 16,
              position: "relative",
              flex: narrow ? 1 : "0 0 auto",
              fontFamily: "'Inter', sans-serif",
              color: active ? "#1A56DB" : "#6b7280",
            }}
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: narrow ? 34 : 40,
                height: narrow ? 34 : 40,
                borderRadius: 12,
                background: active ? "rgba(26,86,219,0.12)" : "transparent",
                boxShadow: active
                  ? "0 0 0 4px rgba(26,86,219,0.10), 0 4px 14px rgba(26,86,219,0.30)"
                  : "none",
                transition: "all 0.22s cubic-bezier(.16,1,.3,1)",
              }}
            >
              {n.icon(active ? "#1A56DB" : "#9ca3af")}
            </span>
            {narrow && (
              <span style={{ fontSize: 10, fontWeight: active ? 800 : 500 }}>
                {n.label === "Dashboard" ? "Home"
                  : n.label === "Send Money" ? "Send"
                  : n.label === "Request Money" ? "Request"
                  : n.label === "Pay Requests" ? "Pay Req"
                  : n.label === "History" ? "History"
                  : n.label === "Profile" ? "Profile"
                  : n.label}
              </span>
            )}
            {n.badge > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: narrow ? 2 : 4,
                  right: narrow ? "18%" : 6,
                  background: "#dc2626",
                  color: "#fff",
                  borderRadius: 10,
                  fontSize: 9,
                  fontWeight: 800,
                  padding: "2px 5px",
                  minWidth: 16,
                  textAlign: "center",
                  lineHeight: 1.1,
                  boxShadow: "0 2px 6px rgba(220,38,38,0.4)",
                }}
              >
                {n.badge}
              </span>
            )}
          </button>
        );
      })}

      {/* Divider between navigation and sign-out */}
      <div
        aria-hidden="true"
        style={{
          width: 1,
          alignSelf: "stretch",
          margin: narrow ? "4px 4px" : "8px 6px",
          background: "linear-gradient(to bottom, transparent, rgba(15,30,46,0.18), transparent)",
        }}
      />

      <button
        onClick={onLogout}
        title="Sign Out"
        className="dock-item logout"
        style={{
          display: "flex",
          flexDirection: narrow ? "column" : "row",
          alignItems: "center",
          justifyContent: "center",
          gap: narrow ? 3 : 0,
          width: narrow ? "auto" : 56,
          height: narrow ? "auto" : 56,
          minWidth: narrow ? 0 : 56,
          padding: narrow ? "6px 10px" : 0,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          borderRadius: narrow ? 12 : 16,
          position: "relative",
          flex: narrow ? 1 : "0 0 auto",
          fontFamily: "'Inter', sans-serif",
          color: "#9ca3af",
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: narrow ? 34 : 40,
            height: narrow ? 34 : 40,
            borderRadius: 12,
            background: "transparent",
            transition: "all 0.22s cubic-bezier(.16,1,.3,1)",
          }}
        >
          {Ic.logout("#9ca3af")}
        </span>
        {narrow && (
          <span style={{ fontSize: 10, fontWeight: 500 }}>Sign Out</span>
        )}
      </button>
    </div>
  );
}
