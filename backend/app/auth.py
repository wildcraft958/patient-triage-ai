"""Who may do what, decided behind the API.

The console already disables the controls a role cannot use and says why. That
is the right thing for the person at the workstation, but a disabled button is
a courtesy, not a control: the API is reachable without the console, so an
"acuity changes need RN sign-off" rule that lives only in the browser is not a
rule at all. This table is the one the service enforces.

Identity itself is still the demonstration layer the sign-in card describes: a
deployment resolves the badge against the hospital directory over SAML or
OIDC, and nothing downstream of the resolved role changes when it does. What
is real here is that the permission decision is taken on the server.
"""

from fastapi import HTTPException

# Mirrors frontend/src/auth/roles.js. The console draws these to decide what to
# offer; this decides what to allow, and a difference between the two shows up
# as a 403 rather than as a silent grant.
ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    "nurse": frozenset({"accept", "override", "reassess", "acknowledge",
                        "vitals", "intake"}),
    "ma": frozenset({"reassess", "acknowledge", "vitals", "intake"}),
    "admin": frozenset(),
}

# The demo lets an operator type any badge, so the role is read from the
# prefix a hospital directory would have assigned it.
BADGE_PREFIX: dict[str, str] = {"RN": "nurse", "MA": "ma", "ADM": "admin"}


def role_for(badge_id: str) -> str | None:
    """The role a badge resolves to, or None when it resolves to nobody."""
    if not badge_id:
        return None
    return BADGE_PREFIX.get(badge_id.split("-", 1)[0].upper())


def require(badge_id: str | None, action: str) -> str:
    """Authorise `action` for the holder of `badge_id`, or raise 403.

    An unresolvable badge is refused rather than waved through: better a
    clinician who has to sign in again than an action attributed to nobody.
    """
    role = role_for(badge_id or "")
    if role is None:
        raise HTTPException(403, f"badge '{badge_id}' resolves to no role")
    if action not in ROLE_PERMISSIONS[role]:
        title = {"nurse": "A triage nurse", "ma": "A medical assistant",
                 "admin": "A clinical administrator"}[role]
        raise HTTPException(403, f"{title} may not {action} on this board")
    return role
