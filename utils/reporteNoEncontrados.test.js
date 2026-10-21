import { describe, it, expect } from "vitest";

const {
  fechaColombia,
  esFechaValida,
  rangoDiaColombia,
  buscarLinea,
  armarReporte,
  renderAsunto,
  renderHtml,
} = await import("./reporteNoEncontrados");

const SEDES = [
  { id: "s1", nombre: "Copacabana" },
  { id: "s2", nombre: "Girardota" },
];

const ASIGNACIONES = [
  {
    id: 10,
    nombre_picker: "Ana",
    reporte_snapshot: {
      line_items: [
        { product_id: 111, variation_id: 0, name: "Arroz 500g", sku: "1001" },
        { product_id: 200, variation_id: 201, name: "Leche - Deslactosada", sku: "2001" },
      ],
    },
  },
  {
    id: 11,
    nombre_picker: "Luis",
    reporte_snapshot: { line_items: [{ product_id: 111, variation_id: 0, name: "Arroz 500g", sku: "1001" }] },
  },
];

const log = (over) => ({
  id_asignacion: 10,
  id_pedido: 900,
  id_producto_original: 111,
  nombre_producto: "Arroz 500g",
  accion: "no_encontrado",
  motivo: "No encontrado en sala",
  pasillo: "P3",
  sede_id: "s1",
  ...over,
});

describe("día en Colombia", () => {
  it("las 23:30 de Colombia ya son el día siguiente en UTC, pero el reporte es de hoy", () => {
    // 2026-10-22T04:30Z = 2026-10-21 23:30 en Bogotá
    expect(fechaColombia(new Date("2026-10-22T04:30:00Z"))).toBe("2026-10-21");
  });

  it("el rango cubre de medianoche a medianoche en Colombia", () => {
    expect(rangoDiaColombia("2026-10-21")).toEqual({
      desde: "2026-10-21T05:00:00.000Z",
      hasta: "2026-10-22T05:00:00.000Z",
    });
  });

  it("rechaza fechas que no existen", () => {
    expect(esFechaValida("2026-02-30")).toBe(false);
    expect(esFechaValida("21/10/2026")).toBe(false);
    expect(esFechaValida("2026-10-21")).toBe(true);
    expect(() => rangoDiaColombia("ayer")).toThrow();
  });
});

describe("buscarLinea", () => {
  it("encuentra por variation_id antes que por product_id", () => {
    expect(buscarLinea(ASIGNACIONES[0].reporte_snapshot, 201).sku).toBe("2001");
    expect(buscarLinea(ASIGNACIONES[0].reporte_snapshot, 111).sku).toBe("1001");
  });

  it("sin snapshot no revienta", () => {
    expect(buscarLinea(null, 111)).toBeNull();
  });
});

describe("armarReporte", () => {
  it("una fila por unidad: 3 filas iguales son 3 unidades de UN producto", () => {
    const r = armarReporte({ logs: [log(), log(), log()], asignaciones: ASIGNACIONES, sedes: SEDES, fecha: "2026-10-21" });
    const [p] = r.sedes[0].no_encontrados;
    expect(r.sedes[0].no_encontrados).toHaveLength(1);
    expect(p.unidades).toBe(3);
    expect(p.pedidos).toEqual(["900"]);
    expect(r.totales).toMatchObject({ productos_no_encontrados: 1, unidades_no_encontradas: 3 });
  });

  it("junta el mismo producto de varios pedidos y pickers, con el SKU del snapshot", () => {
    const r = armarReporte({
      logs: [log(), log({ id_asignacion: 11, id_pedido: 901, motivo: "Stock insuficiente" })],
      asignaciones: ASIGNACIONES,
      sedes: SEDES,
      fecha: "2026-10-21",
    });
    const [p] = r.sedes[0].no_encontrados;
    expect(p.sku).toBe("1001");
    expect(p.pedidos).toEqual(["900", "901"]);
    expect(p.pickers).toEqual(["Ana", "Luis"]);
    expect(p.motivos.map((m) => m.nombre).sort()).toEqual(["No encontrado en sala", "Stock insuficiente"]);
  });

  it("separa por sede: el mismo producto en dos sedes son dos revisiones distintas", () => {
    const r = armarReporte({ logs: [log(), log({ sede_id: "s2" })], asignaciones: ASIGNACIONES, sedes: SEDES, fecha: "2026-10-21" });
    expect(r.sedes.map((s) => s.sede)).toEqual(["Copacabana", "Girardota"]);
  });

  it("los sustituidos van aparte, con lo que se entregó en su lugar", () => {
    const r = armarReporte({
      logs: [log(), log({ accion: "sustituido", id_producto_original: 201, nombre_producto: "Leche - Deslactosada", nombre_sustituto: "Leche entera", motivo: null })],
      asignaciones: ASIGNACIONES,
      sedes: SEDES,
      fecha: "2026-10-21",
    });
    const sede = r.sedes[0];
    expect(sede.no_encontrados).toHaveLength(1);
    expect(sede.sustituidos[0]).toMatchObject({ sku: "2001", unidades: 1 });
    expect(sede.sustituidos[0].sustitutos).toEqual([{ nombre: "Leche entera", veces: 1 }]);
  });

  it("ignora recolectados y otras acciones", () => {
    const r = armarReporte({ logs: [log({ accion: "recolectado" }), log({ accion: "reset" })], asignaciones: ASIGNACIONES, sedes: SEDES, fecha: "2026-10-21" });
    expect(r.sin_novedades).toBe(true);
  });

  it("sin asignación ni sede conocida igual reporta el producto", () => {
    const r = armarReporte({ logs: [log({ id_asignacion: 999, sede_id: "zz" })], asignaciones: [], sedes: [], fecha: "2026-10-21" });
    expect(r.sedes[0].sede).toBe("Sede zz");
    expect(r.sedes[0].no_encontrados[0]).toMatchObject({ nombre: "Arroz 500g", sku: null, unidades: 1 });
  });
});

describe("correo", () => {
  it("un día sin novedades también se manda, y lo dice", () => {
    const r = armarReporte({ logs: [], fecha: "2026-10-21" });
    expect(renderAsunto(r)).toMatch(/sin productos no encontrados/);
    expect(renderHtml(r)).toMatch(/ningún picker reportó/);
  });

  it("escapa el HTML que viene de los nombres de producto", () => {
    const r = armarReporte({ logs: [log({ nombre_producto: "<script>x</script>" })], asignaciones: ASIGNACIONES, sedes: SEDES, fecha: "2026-10-21" });
    const html = renderHtml(r);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("el asunto cuenta productos, no filas", () => {
    const r = armarReporte({ logs: [log(), log(), log()], asignaciones: ASIGNACIONES, sedes: SEDES, fecha: "2026-10-21" });
    expect(renderAsunto(r)).toBe("Picking ecommerce 2026-10-21: 1 producto no encontrado para revisar");
  });
});
