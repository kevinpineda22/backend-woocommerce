/**
 * SEDE CONTEXT (React Context + localStorage)
 *
 * Almacena y proporciona el contexto de sede a toda la aplicación.
 * - Carga la sede del usuario autenticado al montar
 * - Permite a super_admins cambiar de sede
 * - Inyecta sede_id en todas las peticiones axios
 *
 * USO:
 *   import { useSedeContext, SedeProvider } from './SedeContext';
 *
 *   // En el componente raíz:
 *   <SedeProvider> <App /> </SedeProvider>
 *
 *   // En cualquier componente hijo:
 *   const { sedeActual, sedes, cambiarSede, sedeId } = useSedeContext();
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import axios from "axios";

import { API_BASE } from "./ecommerceApi";

const ORDERS_API_BASE = `${API_BASE}/orders`;

const SedeContext = createContext(null);

export const useSedeContext = () => {
  const ctx = useContext(SedeContext);
  if (!ctx) {
    // Si no hay provider, devolver valores por defecto (compatible con código legacy)
    return {
      sedeActual: null,
      sedeId: null,
      sedeName: "Sin Sede",
      sedes: [],
      loading: false,
      isSuperAdmin: false,
      isMultiSede: false,
      ecommerceRol: null,
      ecommerceRolLabel: "",
      cambiarSede: () => {},
      getSedeParam: () => "",
      getSedeHeader: () => ({}),
    };
  }
  return ctx;
};

export const SedeProvider = ({ children }) => {
  const [sedes, setSedes] = useState([]);
  const [sedeActual, setSedeActual] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [ecommerceRol, setEcommerceRol] = useState(null);

  // Mapa de labels para ecommerce_rol
  const ECOM_ROL_LABELS = {
    ecommerce_admin_global: "Admin Global",
    ecommerce_admin_sede: "Admin de Sede",
    ecommerce_picker: "Picker",
    ecommerce_auditor: "Auditor",
  };

  // Cargar sedes y determinar la sede del usuario
  useEffect(() => {
    const init = async () => {
      try {
        // 1. Obtener lista de sedes
        const { data: sedesData } = await axios.get(`${ORDERS_API_BASE}/sedes`);
        setSedes(sedesData || []);

        // 2. Obtener info del usuario actual
        const empleadoStr = localStorage.getItem("empleado_info");
        const empleado = empleadoStr ? JSON.parse(empleadoStr) : {};

        // 3. Determinar si es super admin (SOLO super_admin global o ecommerce_admin_global)
        const role = empleado.role || "";
        const ecomRol = empleado.ecommerce_rol || null;
        setEcommerceRol(ecomRol);

        const esSuperAdmin =
          ["super_admin"].includes(role) ||
          ecomRol === "ecommerce_admin_global";
        setIsSuperAdmin(esSuperAdmin);

        // 4. Determinar sede del usuario
        // ── Si NO es super admin, SIEMPRE usar la sede asignada (sin override) ──
        if (!esSuperAdmin) {
          // a) Sede asignada en el perfil
          if (empleado.sede_id) {
            const userSede = sedesData.find((s) => s.id === empleado.sede_id);
            if (userSede) {
              setSedeActual(userSede);
              localStorage.setItem("ecommerce_sede_id", userSede.id);
              localStorage.setItem("ecommerce_sede_nombre", userSede.nombre);
              setLoading(false);
              return;
            }
          }

          // b) Si es picker, buscar su sede desde wc_pickers
          const email = localStorage.getItem("correo_empleado");
          if (email && (role === "picker" || ecomRol === "ecommerce_picker")) {
            const { data: pickersData } = await axios.get(
              `${ORDERS_API_BASE}/pickers?email=${email}&sede_id=todas`,
            );
            if (pickersData && pickersData[0]?.sede_id) {
              const pickerSede = sedesData.find(
                (s) => s.id === pickersData[0].sede_id,
              );
              if (pickerSede) {
                setSedeActual(pickerSede);
                localStorage.setItem("ecommerce_sede_id", pickerSede.id);
                localStorage.setItem(
                  "ecommerce_sede_nombre",
                  pickerSede.nombre,
                );
                setLoading(false);
                return;
              }
            }
          }

          // c) Fallback: primera sede disponible
          if (sedesData.length > 0) {
            setSedeActual(sedesData[0]);
            localStorage.setItem("ecommerce_sede_id", sedesData[0].id);
            localStorage.setItem("ecommerce_sede_nombre", sedesData[0].nombre);
          }
          setLoading(false);
          return;
        }

        // ── SUPER ADMIN: puede ver "todas" o elegir sede ──
        const savedSedeId = localStorage.getItem("ecommerce_sede_id");
        if (savedSedeId && savedSedeId !== "todas") {
          const savedSede = sedesData.find((s) => s.id === savedSedeId);
          if (savedSede) {
            setSedeActual(savedSede);
            setLoading(false);
            return;
          }
        }

        // Super admin: "todas" por defecto
        setSedeActual(null);
        localStorage.setItem("ecommerce_sede_id", "todas");
      } catch (error) {
        console.error("Error cargando contexto de sede:", error);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  // Cambiar de sede (solo para super_admin / ecommerce_admin_global)
  const cambiarSede = useCallback(
    (sede) => {
      if (!isSuperAdmin) return; // No permitir cambio si no es super admin
      if (sede === null || sede === "todas") {
        setSedeActual(null);
        localStorage.setItem("ecommerce_sede_id", "todas");
        localStorage.setItem("ecommerce_sede_nombre", "Todas las sedes");
      } else {
        setSedeActual(sede);
        localStorage.setItem("ecommerce_sede_id", sede.id);
        localStorage.setItem("ecommerce_sede_nombre", sede.nombre);
      }
    },
    [isSuperAdmin],
  );

  // Helper: Generar query param para URLs
  const getSedeParam = useCallback(() => {
    if (!sedeActual) return "sede_id=todas";
    return `sede_id=${sedeActual.id}`;
  }, [sedeActual]);

  // Helper: Generar header para requests
  const getSedeHeader = useCallback(() => {
    if (!sedeActual) return { "X-Sede-ID": "todas" };
    return { "X-Sede-ID": sedeActual.id };
  }, [sedeActual]);

  const value = {
    sedeActual,
    sedeId: sedeActual?.id || null,
    sedeName: sedeActual?.nombre || "Todas las sedes",
    sedes,
    loading,
    isSuperAdmin,
    isMultiSede: sedes.length > 1,
    ecommerceRol,
    ecommerceRolLabel: ECOM_ROL_LABELS[ecommerceRol] || "",
    cambiarSede,
    getSedeParam,
    getSedeHeader,
  };

  return <SedeContext.Provider value={value}>{children}</SedeContext.Provider>;
};

export default SedeContext;
