// Configuración centralizada de permisos por módulo/flujo

export const PERMISSION_CONFIGS = {
  // Módulo de Aprobadores (actual)
  aprobadores: {
    adminEmails: [
      "gestionhumana@merkahorrosas.com",
      "juanmerkahorro@gmail.com",
    ],
    description: "Administración de aprobadores del flujo de perfil",
  },

  // Ejemplo: Módulo de Inventarios
  inventarios: {
    adminEmails: [
      "inventarios@merkahorrosas.com",
      "bodega@construahorro.com",
      "logistica@megamayoristas.com",
    ],
    supervisorEmails: ["supervisor.inventarios@merkahorrosas.com"],
    description: "Gestión de inventarios y productos",
  },

  // Ejemplo: Módulo de Contabilidad
  contabilidad: {
    adminEmails: [
      "contabilidad@merkahorrosas.com",
      "finanzas@construahorro.com",
    ],
    auditorEmails: ["auditoria@merkahorrosas.com"],
    description: "Módulo financiero y contable",
  },

  // Ejemplo: Módulo de Ventas
  ventas: {
    adminEmails: ["gerente.ventas@merkahorrosas.com"],
    vendedorEmails: [
      "vendedor1@merkahorrosas.com",
      "vendedor2@construahorro.com",
    ],
    description: "Gestión de ventas y clientes",
  },

  // Módulo de Ecommerce
  ecommerce: {
    adminEmails: ["johanmerkahorro777@gmail.com", "juanmerkahorro@gmail.com"],
    managerEmails: ["johanmerkahorro777@gmail.com"],
    description: "Gestión de pedidos de Ecommerce",
  },

  // =======================================
  // CONFIGURACIÓN MULTI-SEDE ECOMMERCE
  // =======================================
  ecommerce_sedes: {
    // Roles que pueden ver TODAS las sedes sin restricción
    globalRoles: ["super_admin", "admin"],
    // Roles que pueden crear/editar/desactivar sedes
    sedeManagementRoles: ["super_admin"],
    // Roles que pueden asignar pickers a sedes
    pickerAssignmentRoles: ["super_admin", "admin"],
    // Roles válidos para el módulo ecommerce/picking
    validRoles: ["super_admin", "admin", "admin_sede", "picker", "auditor"],
    description: "Control de acceso multi-sede para ecommerce picking",
  },
};

// Configuración de acceso por empresa según correo electrónico
export const COMPANY_ACCESS_CONFIG = {
  // Usuarios que solo pueden acceder al formulario de Merkahorro
  merkahorro: [
    "usuario2@merkahorrosas.com",
    "gerente@merkahorrosas.com",
    "empleado.merkahorro@merkahorrosas.com",
  ],

  // Usuarios que solo pueden acceder al formulario de Construahorro
  construahorro: [
    "johanmerkahorro777@gmail.com",
    "usuario2@construahorro.com",
    "gerente@construahorro.com",
    "sistemas3@merkahorrosas.com",
  ],

  // Usuarios que solo pueden acceder al formulario de Megamayoristas
  megamayoristas: [
    "usuario2@megamayoristas.com",
    "gerente@megamayoristas.com",
    "desarrollo@merkahorrosas.com",
  ],

  // Usuarios con acceso completo a todos los formularios (superadmins)
  all: [
    "gestionhumana@merkahorrosas.com",
    "practicanteadministrativa@merkahorrosas.com",
    "juanmerkahorro@gmail.com",
  ],
};

// Función helper para verificar permisos específicos
export const checkPermission = (userEmail, module, role = "admin") => {
  if (!userEmail || !module || !PERMISSION_CONFIGS[module]) {
    return false;
  }

  const config = PERMISSION_CONFIGS[module];
  const emailKey = `${role}Emails`;

  if (!config[emailKey]) {
    return false;
  }

  return config[emailKey].includes(userEmail.toLowerCase());
};

// Función para obtener todos los roles de un usuario en un módulo
export const getUserRoles = (userEmail, module) => {
  if (!userEmail || !module || !PERMISSION_CONFIGS[module]) {
    return [];
  }

  const config = PERMISSION_CONFIGS[module];
  const roles = [];

  Object.keys(config).forEach((key) => {
    if (key.endsWith("Emails") && Array.isArray(config[key])) {
      const roleName = key.replace("Emails", "");
      if (config[key].includes(userEmail.toLowerCase())) {
        roles.push(roleName);
      }
    }
  });

  return roles;
};

// Función para obtener el tipo de acceso de empresa para un usuario
export const getUserCompanyAccess = (userEmail) => {
  if (!userEmail) return null;

  const email = userEmail.toLowerCase();

  // Verificar acceso completo primero
  if (COMPANY_ACCESS_CONFIG.all.includes(email)) {
    return "all";
  }

  // Verificar acceso específico por empresa
  for (const [company, emails] of Object.entries(COMPANY_ACCESS_CONFIG)) {
    if (company !== "all" && emails.includes(email)) {
      return company;
    }
  }

  return null; // Sin acceso configurado
};

// Función para verificar si un usuario puede acceder a una empresa específica
export const canAccessCompany = (userEmail, company) => {
  const access = getUserCompanyAccess(userEmail);
  return access === "all" || access === company;
};

// Función para obtener las empresas disponibles para un usuario
export const getAvailableCompanies = (userEmail) => {
  const access = getUserCompanyAccess(userEmail);

  if (!access) return [];

  if (access === "all") {
    return ["merkahorro", "construahorro", "megamayoristas"];
  }

  return [access];
};

// =======================================
// FUNCIONES DE PERMISOS MULTI-SEDE
// =======================================

/**
 * ¿Este rol puede ver todas las sedes sin filtro?
 */
export const isGlobalSedeRole = (role) => {
  const config = PERMISSION_CONFIGS.ecommerce_sedes;
  return config?.globalRoles?.includes(role) || false;
};

/**
 * ¿El usuario tiene acceso a una sede específica?
 * @param {string} userRole - Rol del usuario (de profiles.role)
 * @param {string|null} userSedeId - Sede asignada al usuario
 * @param {string|null} targetSedeId - Sede a la que intenta acceder
 */
export const canAccessSede = (userRole, userSedeId, targetSedeId) => {
  if (isGlobalSedeRole(userRole)) return true;
  if (!targetSedeId) return false; // "Todas" solo para roles globales
  return userSedeId === targetSedeId;
};

/**
 * ¿El usuario puede gestionar (crear/editar/desactivar) sedes?
 */
export const canManageSedes = (userRole) => {
  const config = PERMISSION_CONFIGS.ecommerce_sedes;
  return config?.sedeManagementRoles?.includes(userRole) || false;
};

/**
 * ¿El usuario puede asignar pickers a sedes?
 */
export const canAssignPickersToSede = (userRole) => {
  const config = PERMISSION_CONFIGS.ecommerce_sedes;
  return config?.pickerAssignmentRoles?.includes(userRole) || false;
};

/**
 * ¿El usuario tiene acceso al módulo ecommerce/picking?
 */
export const canAccessEcommercePicking = (userRole) => {
  const config = PERMISSION_CONFIGS.ecommerce_sedes;
  return config?.validRoles?.includes(userRole) || false;
};

/**
 * Retorna resumen de permisos sede para un perfil dado
 */
export const getSedePermissions = (profile) => {
  if (!profile)
    return {
      role: "none",
      sedeId: null,
      isGlobal: false,
      canManage: false,
      canAssign: false,
    };
  const role = profile.role || "empleado";
  const sedeId = profile.sede_id || null;
  return {
    role,
    sedeId,
    isGlobal: isGlobalSedeRole(role),
    canManage: canManageSedes(role),
    canAssign: canAssignPickersToSede(role),
    canAccess: canAccessEcommercePicking(role),
  };
};
