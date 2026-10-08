const ROLES = Object.freeze({
  OWNER: "owner",
  ADMIN: "admin",
  MARKETER: "marketer",
  KOC: "koc",
});

const USER_STATUSES = Object.freeze({
  ACTIVE: "active",
  INACTIVE: "inactive",
  BANNED: "banned",
});

const ALL_ROLES = Object.freeze([ROLES.OWNER, ROLES.ADMIN, ROLES.MARKETER, ROLES.KOC]);

const ALL_USER_STATUSES = Object.freeze([
  USER_STATUSES.ACTIVE,
  USER_STATUSES.INACTIVE,
  USER_STATUSES.BANNED,
]);

/** Roles that can be assigned via admin user management (admin accounts are seed-only). */
const ASSIGNABLE_ROLES = Object.freeze([ROLES.MARKETER, ROLES.KOC]);

/** Roles an owner may assign to admin accounts. */
const OWNER_ADMIN_ASSIGNABLE_ROLES = Object.freeze([ROLES.ADMIN, ROLES.MARKETER, ROLES.KOC]);

function isOwner(role) {
  return role === ROLES.OWNER;
}

function isAdminOrOwner(role) {
  return role === ROLES.ADMIN || role === ROLES.OWNER;
}

module.exports = {
  ROLES,
  USER_STATUSES,
  ALL_ROLES,
  ALL_USER_STATUSES,
  ASSIGNABLE_ROLES,
  OWNER_ADMIN_ASSIGNABLE_ROLES,
  isOwner,
  isAdminOrOwner,
};
