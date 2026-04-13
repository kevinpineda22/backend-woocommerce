# Manual del Administrador — Sistema de Picking

> **Para:** Supervisores y administradores de bodega
> **Sede:** Girardota, Antioquia
> **Versión:** 2025

---

## 1. Introducción

El Sistema de Picking incluye un panel de administración diseñado para que usted, como supervisor o administrador de bodega, pueda gestionar toda la operación de preparación de pedidos desde un solo lugar.

Desde este panel usted puede:

- Ver los pedidos nuevos que llegan de la tienda en línea y asignarlos a los pickers.
- Monitorear en tiempo real lo que cada picker está haciendo en la bodega.
- Intervenir cuando sea necesario: anular productos, forzar recolecciones o cancelar sesiones.
- Revisar el historial completo de sesiones finalizadas con detalle producto por producto.
- Gestionar el equipo de pickers: crear nuevos, editar datos, asignar sedes y cancelar rutas.
- Controlar los pagos pendientes y generar certificados de salida (manifiestos).
- Consultar métricas de rendimiento y analítica de la operación.

En este manual encontrará paso a paso cómo usar cada sección del panel. Todo lo que se describe aquí corresponde exactamente a lo que usted verá en pantalla.

---

## 2. Conceptos básicos que debe conocer

**Sede**
Es el punto de distribución donde se procesan los pedidos. El sistema soporta múltiples sedes. Dependiendo de su rol, usted puede ver solo la suya o todas las sedes a la vez.

**Sesión de picking (Ruta)**
Es la agrupación de uno o varios pedidos asignados a un picker para que los prepare en la bodega. Cuando usted crea una sesión, el sistema toma una "foto" (snapshot) de los pedidos en ese instante y se la entrega al picker como su lista de trabajo.

**Snapshot**
Es la copia exacta de los pedidos al momento de crear la sesión. Esto garantiza que si un pedido se modifica en WooCommerce después de ser asignado, el picker sigue trabajando con la versión original. El snapshot incluye productos, cantidades, precios, imágenes y notas del cliente.

**Asignación**
Es la relación entre un pedido y una sesión de picking. Cuando usted asigna pedidos a un picker, el sistema crea las asignaciones correspondientes y cambia el estado del picker a "picking" (en ruta).

**Estados de una sesión**

- **Activa (en proceso):** El picker está trabajando. Se ve en la sección "En Proceso".
- **Finalizada por picker:** El picker terminó su ruta y generó el código QR para auditoría. Aparece en "Pendiente Auditoría".
- **Auditada:** El auditor verificó y aprobó la entrega. Aparece en "Pendiente de Pago".
- **Finalizada (pagada):** El administrador confirmó haber recibido el dinero del picker. Aparece en "Historial".

**Picker**
Es el operario de bodega que ejecuta la recolección físicamente. Cada picker tiene un nombre, correo electrónico, sede asignada y un estado operativo (disponible o en ruta).

**Super Admin vs. Admin de Sede**

- **Super Admin (Admin Global):** Tiene visibilidad y control sobre todas las sedes. Puede cambiar entre sedes o ver el consolidado "Todas las sedes".
- **Admin de Sede:** Tiene control únicamente sobre su sede asignada. Solo ve pickers, pedidos y sesiones de su propia sede.

---

## 3. Ingreso al sistema

### 3.1 Selección de sede

Al ingresar al panel de administración, el sistema determina automáticamente su sede según su perfil de usuario:

- **Si usted es Admin de Sede:** La sede se asigna automáticamente. Verá el nombre de su sede en la barra lateral izquierda con un indicador de color y su rol (por ejemplo: 🏪 **Admin de Sede** — **Girardota**). No puede cambiarla.

- **Si usted es Super Admin (Admin Global):** Verá un botón desplegable con el ícono 👑 y el texto **Admin Global**. Al hacer clic, se abre un menú donde puede:
  - Seleccionar **"Todas las sedes"** (🌐 Vista global) para ver la operación consolidada de todas las sedes a la vez.
  - Seleccionar una sede específica (🏬) para enfocar la vista en esa ubicación en particular.

La sede seleccionada se recuerda entre sesiones. Si cierra el navegador y vuelve a entrar, el sistema conserva la sede que usted eligió la última vez.

### 3.2 Estructura de la pantalla

La pantalla del panel de administración se divide en dos partes principales:

**Barra lateral izquierda (menú de navegación):**

- Botón de regreso al menú de acceso (flecha izquierda).
- Ícono de usuario y título **"Admin Picking"**.
- Selector de sede (descrito arriba).
- Menú de navegación con las secciones:
  - **Operación:** "Por Asignar" y "En Proceso" (con contadores de pedidos).
  - **Auditoría:** "Pendiente Auditoría" (con contador).
  - **Pagos:** "Pendiente Pago" (con contador).
  - **Historial:** "Historial" de sesiones pasadas.
  - **Administración:** "Pickers" (gestión del equipo).
- Al pie, una frase motivacional que cambia aleatoriamente cada vez que carga la página.

**Área principal (contenido):**
A la derecha de la barra lateral se muestra el contenido de la sección seleccionada. Cada sección se describe en detalle en las siguientes páginas de este manual.

**En dispositivos móviles (celular/tableta):**
La barra lateral se oculta automáticamente. Para abrirla, toque el botón de menú (tres líneas horizontales) en la esquina superior izquierda. Al seleccionar una opción del menú, este se cierra automáticamente.

---

## 4. Panel principal / Centro de Comando — Sesiones en proceso

### 4.1 Cómo acceder

Toque **"En Proceso"** en la barra lateral. El ícono de una persona corriendo 🏃 lo identifica. El número a la derecha indica cuántos pedidos están siendo procesados actualmente.

### 4.2 Qué ve en esta pantalla

El encabezado muestra **"🚀 Centro de Comando"** junto con una frase motivacional.

El cuerpo muestra una cuadrícula de tarjetas, una por cada sesión activa. Los datos se actualizan **automáticamente en tiempo real** gracias a la conexión con Supabase; no necesita refrescar la página constantemente. No obstante, existe un botón **"Refrescar Datos"** por si desea forzar una actualización manual.

### 4.3 Información en cada tarjeta de sesión activa

Cada tarjeta muestra:

- **Avatar y nombre del picker:** La inicial del nombre en un círculo y su nombre completo.
- **ID de sesión:** Los primeros 6 caracteres del identificador de la sesión (por ejemplo: `#a3f2c1`).
- **Temporizador doble:**
  - ⏰ **Tiempo en sesión:** Cuánto tiempo ha pasado desde que se creó la sesión. Si supera los 45 minutos, el temporizador se pone en rojo como alerta.
  - 🛒 **Tiempo pickeando:** Cuánto tiempo ha pasado desde que el picker escaneó el primer producto. Si aún no ha empezado a pickear, dice **"Sin iniciar"**.
- **Barra de progreso:** Muestra el porcentaje de avance (por ejemplo: `8 / 12 unidades — 67%`).
- **Batch de pedidos:** Lista los números de pedido incluidos en la sesión (ejemplo: `#1023, #1024`).
- **Estadísticas rápidas:**
  - ✅ **Listos:** Productos ya recolectados.
  - 🔄 **Cambios:** Productos sustituidos.
  - ⏳ **Faltan:** Productos pendientes.
- **Productos cancelados por admin:** Si usted anuló algún producto desde el panel, aparece una alerta: **"⚠️ N producto(s) cancelado(s) por admin"**.
- **Ubicación actual:** El último pasillo donde el picker se encuentra trabajando.
- **Sede** (solo en modo Super Admin con "Todas las sedes"): Muestra el nombre de la sede a la que pertenece la sesión.
- **Botón "Ver Detalle en Vivo":** Abre la vista de monitoreo en tiempo real de esa sesión (ver sección 8).

### 4.4 ¿Qué pasa si no hay sesiones activas?

Si no hay ningún picker trabajando en este momento, verá un mensaje con el ícono 🏃 que dice:

> **"Todo tranquilo por aquí."**
> No hay pickers en ruta en este momento.

Y un botón **"Actualizar"** para verificar de nuevo.

### 4.5 ¿Qué pasa si la pantalla está cargando?

Mientras se obtienen los datos, verá un ícono giratorio con el texto **"Cargando rutas en vivo..."**. Esto es normal y dura solo unos segundos.

---

## 5. Gestión de pedidos — Pedidos pendientes por asignar

### 5.1 Cómo acceder

Toque **"Por Asignar"** en la barra lateral. El ícono de una caja 📦 lo identifica. El número a la derecha indica cuántos pedidos están esperando ser asignados.

### 5.2 Qué ve en esta pantalla

El encabezado muestra **"📦 Pedidos Pendientes"** junto con una frase motivacional.

Debajo del encabezado aparecen los **filtros** (ver sección 5.3) y luego la **cuadrícula de tarjetas de pedidos**.

### 5.3 Filtros disponibles

En la parte superior del área de contenido tiene cuatro elementos de filtrado:

- **🔍 Buscar:** Escriba un número de pedido (#ID) o el nombre de un cliente. Los resultados se actualizan al instante mientras escribe.
- **📅 Fecha:** Seleccione una fecha específica para ver solo los pedidos de ese día.
- **📍 Zona:** Escriba un barrio o ciudad para filtrar por dirección de entrega.
- **Botón "Sincronizar":** Fuerza una sincronización fresca desde WooCommerce. Útil cuando sospecha que un pedido nuevo no aparece.
- **Botón "Limpiar":** Borra todos los filtros aplicados.

Debajo de los filtros verá el texto: **"Mostrando X de Y pedidos"**, que le indica cuántos pedidos coinciden con su búsqueda.

### 5.4 Información en cada tarjeta de pedido

Cada pedido se muestra como una tarjeta ("ticket") con la siguiente información:

- **Casilla de selección (checkbox):** En la esquina superior izquierda. Permite seleccionar múltiples pedidos para asignarlos en lote.
- **Número de pedido:** Por ejemplo, `#1023`.
- **Sede detectada:** Si el sistema identificó a qué sede pertenece el pedido, aparece una etiqueta con el nombre (ejemplo: 🏪 Girardota).
- **Etiqueta RECOGIDA:** Si el cliente eligió recoger en sede en lugar de domicilio, verá el ícono 🚶 y la palabra **"RECOGIDA"**.
- **Hora de creación:** La hora en que se realizó el pedido.
- **Nombre del cliente.**
- **Cantidad de items y precio total.**
- **Dirección de entrega** o "Retira el cliente en sede" si es recogida.

### 5.5 Ver el detalle de un pedido

Toque en cualquier parte de la tarjeta (excepto el checkbox) para abrir el **modal de detalle del pedido**. En esta ventana verá:

**Encabezado:**

- Número de pedido y fecha/hora.
- Total del pedido en pesos colombianos.

**Información del cliente:**

- Nombre completo, correo electrónico y teléfono.

**Información de entrega:**

- Dirección completa, o "🚶‍♂️ Recogida en Sede" si aplica.
- Nota del cliente (si existe), resaltada en un recuadro.

**Lista de productos:**
Para cada producto del pedido:

- Imagen del producto (si existe) con un círculo que indica la cantidad.
- Nombre completo del producto.
- SKU y precio.
- Nota especial del producto (si el cliente dejó una instrucción para ese ítem en particular).

**Acciones al pie del modal:**

- **Cerrar:** Cierra sin hacer nada.
- **Incluir en Lote / ✓ Seleccionado:** Marca o desmarca el pedido para inclusión en un lote de asignación masiva.
- **Asignar Ahora:** Abre directamente el modal de asignación de picker para este pedido individual.

### 5.6 ¿Qué pasa si no hay pedidos pendientes?

Verá un estado vacío con el ícono de una caja abierta y el mensaje:

> **"Todo al dia"**
> No hay nuevos pedidos pendientes de preparar.

Si tiene filtros aplicados y no hay coincidencias, el mensaje cambia a:

> **"Sin Coincidencias"**
> Ningun pedido coincide con tus terminos de busqueda.

---

## 6. Creación de sesiones de picking

### 6.1 Selección de pedidos para asignar

Hay dos formas de seleccionar pedidos para crear una sesión:

**a) Asignación individual:**
Desde la vista de pedidos pendientes, abra el detalle de un pedido (toque la tarjeta) y presione **"Asignar Ahora"**. El sistema abrirá el modal de asignación de picker directamente con ese pedido.

También puede tocar el checkbox de un solo pedido y luego usar la barra de acción masiva (si la hay) o ir directamente a asignar.

**b) Asignación por lote (batch):**

1. En la vista de pedidos pendientes, toque la casilla de verificación de cada pedido que desee incluir en la misma sesión.
2. Los pedidos seleccionados se resaltan visualmente.
3. Luego proceda a la asignación de picker (sección 7).

**Importante:** Todos los pedidos seleccionados se agruparán en una sola sesión para el mismo picker. Es decir, el picker recibirá todos esos pedidos juntos en una sola ruta de trabajo.

### 6.2 Qué sucede al crear la sesión

Cuando confirma la asignación (ver sección 7), el sistema:

1. Crea una nueva sesión de picking en la base de datos.
2. Toma un snapshot de cada pedido seleccionado desde WooCommerce (productos, cantidades, precios, imágenes).
3. Crea las asignaciones entre los pedidos y la sesión.
4. Cambia el estado del picker de "disponible" a "picking" (en ruta).
5. El picker detecta automáticamente la nueva ruta en su aplicación móvil (sin que usted tenga que avisarle manualmente).

Verá un mensaje de confirmación verde: **"✅ Misión asignada a [nombre del picker]"**.

---

## 7. Asignación de pickers

### 7.1 Cómo se abre el modal de asignación

El modal de asignación de picker se abre automáticamente cuando usted:

- Toca **"Asignar Ahora"** en el detalle de un pedido.
- Asigna uno o más pedidos seleccionados con checkbox.

El sistema carga la lista de pickers disponibles para la sede actual.

### 7.2 Qué ve en el modal

**Encabezado:** Muestra el ícono ⏰ y el texto **"Asignar Picker"** con la indicación **"Selecciona un colaborador disponible"**.

**Barra informativa:** Muestra **"Lista de colaboradores (N)"** donde N es el total de pickers registrados en la sede.

**Lista de pickers:** Cada picker se muestra como una tarjeta con:

- **Avatar:** La inicial de su nombre en un círculo.
- **Indicador de estado:** Un punto verde (disponible) o rojo (ocupado) junto al avatar.
- **Nombre completo.**
- **Correo electrónico.**
- **Sede** (si aplica).
- **Badge de acción:**
  - **ASIGNAR** (verde): El picker está disponible. Tóquelo para asignarlo.
  - **OCUPADO** (gris): El picker ya tiene una ruta activa. No se puede seleccionar.
  - **ASIGNANDO** (giratorio): La asignación está en proceso.

Los pickers están ordenados: **disponibles primero** (ordenados alfabéticamente), luego los ocupados.

### 7.3 Cómo confirmar la asignación

Toque la tarjeta del picker disponible que desee asignar. El sistema:

1. Muestra brevemente el estado **"ASIGNANDO"** con un ícono giratorio.
2. Envía la solicitud al servidor para crear la sesión.
3. Si todo sale bien: el modal se cierra, los pedidos desaparecen de la lista de pendientes, y aparece el toast de confirmación verde.
4. Si hay un error: aparece un toast rojo con el mensaje de error.

### 7.4 Cancelar la operación

Si cambia de opinión, toque **"Cancelar Operación"** al pie del modal, o toque fuera del modal para cerrarlo. No se realizará ninguna asignación.

---

## 8. Monitoreo en tiempo real — Vista de sesión activa

### 8.1 Cómo acceder

Desde el Centro de Comando (sección 4), toque el botón **"Ver Detalle en Vivo"** en la tarjeta de la sesión que desea monitorear. Mientras carga, el botón muestra un ícono giratorio y el texto **"Cargando..."**.

Se abre un modal a pantalla completa con la información en vivo de la ruta del picker.

### 8.2 Encabezado del modal

Muestra:

- **"Ruta de [nombre del picker]".**
- Hora de inicio de la sesión.
- Sede (si aplica).
- Un indicador **"🔄 Live"** con ícono giratorio que confirma que los datos se actualizan en tiempo real.

### 8.3 Controles de vista

Debajo del encabezado hay tres botones para cambiar el modo de visualización:

- **Activos (N):** Vista por batch. Muestra todos los productos activos de la sesión en una lista plana. N es la cantidad de productos activos.
- **Pedidos:** Vista agrupada por pedido. Muestra los productos organizados por cliente/pedido.
- **🗑️ (N):** Vista de papelera. Muestra los productos que han sido anulados por el administrador. N es la cantidad de productos anulados.

### 8.4 Vista "Activos" (Batch)

Cada producto se muestra como una tarjeta con:

- **Imagen del producto** (si existe).
- **Nombre del producto.** Si fue sustituido, el nombre original aparece tachado en color marrón.
- **Alerta MULTIPACK:** Si el producto tiene una unidad de medida de tipo empaque (P6, P3, etc.), aparece un badge morado: **"📦 EMPAQUE x6"** (o la cantidad correspondiente).
- **Peso real:** Si el producto fue pesado, aparece en verde el peso registrado (por ejemplo: **"⚖️ 1.350 Kg pesados"**).
- **Pasillo:** Un badge que indica en qué pasillo se encuentra (por ejemplo: **"Pasillo P3"** o **"General"** si no tiene pasillo asignado).
- **Cantidad:** El total solicitado con la unidad de medida.
- **Bloque de sustitución:** Si el producto fue sustituido, aparece un bloque visual con flechas que muestra:
  - El producto original (tachado).
  - La etiqueta **"SUSTITUIDO POR"**.
  - El nombre del producto sustituto, su precio, y cuántas unidades fueron sustituidas vs. el total.
  - Si hubo sustitución parcial (algunas originales + sustituto), se muestran ambas cantidades.
- **Puntos de pedido:** Círculos de colores con letras (A, B, C...) que indican a qué pedido pertenece cada producto.
- **Estado:** Un badge con el estado actual: "pendiente", "parcial", "recolectado", "sustituido".

### 8.5 Acciones del administrador sobre los productos

Para productos con estado **"pendiente"** o **"parcial"**, usted tiene dos acciones disponibles:

**a) Forzar recolección (✅)** — Solo disponible para productos NO pesables:

- Pasa el producto directamente a la canasta como "recolectado" sin necesidad de que el picker lo escanee.
- Útil cuando el picker tiene dificultades con el código de barras pero usted confirmó que el producto está correcto.
- Se requiere confirmación: aparece un modal que pregunta **"¿Estás completamente seguro que deseas realizar esta acción sobre [nombre del producto]?"** con el botón **"Sí, Forzar y Recolectar"**.
- El picker recibe la actualización al instante en su pantalla.

**b) Anular producto (🗑️):**

- Retira el producto de la lista activa del picker.
- Útil cuando el cliente canceló un producto o decidió no llevarlo.
- Se requiere confirmación con modal de advertencia: **"⚠️ Anular Producto"** — botón **"Sí, Anular"** (en rojo).
- El producto pasa a la papelera y el picker deja de verlo en su lista de pendientes.
- Queda registrado en el log de auditoría como "eliminado_admin".

### 8.6 Vista "Papelera" (Productos anulados)

Muestra los productos que usted anuló. Cada uno aparece en escala de grises con el nombre tachado en rojo.

Cada producto anulado tiene un botón **"Restaurar"** que le permite devolver el producto a la lista activa del picker. Al tocar "Restaurar", aparece el modal de confirmación **"🔄 Restaurar a Canasta"** con el botón **"Sí, Restaurar"**.

### 8.7 Vista "Pedidos" (Agrupado por cliente)

Muestra los productos organizados por pedido. Cada grupo tiene:

- **Nombre del cliente** y número de pedido.
- **Progreso:** Contador de productos listos vs. total (ejemplo: `5/8`). Si todos están completos, el número se pone verde.
- **Lista de productos** de ese pedido con estado individual, precios y detalle de sustituciones.

### 8.8 ¿Qué pasa si la sesión no tiene items pendientes?

Si todos los productos fueron procesados, verá el mensaje: **"¡Todo listo! No hay items pendientes."**

### 8.9 Cerrar el modal

Toque el botón **"×"** en la esquina superior derecha, o toque fuera del modal.

---

## 9. Historial de sesiones

### 9.1 Cómo acceder

Toque **"Historial"** en la barra lateral. El ícono de reloj 🕐 lo identifica.

Al entrar, el sistema carga las sesiones finalizadas (pagadas). El encabezado muestra **"📜 Historial de Sesiones"** con un botón **"Refrescar"**.

### 9.2 Qué ve en esta pantalla

Una tabla con las siguientes columnas:

| Columna      | Descripción                                                                              |
| ------------ | ---------------------------------------------------------------------------------------- |
| **Fecha**    | Día y hora de finalización de la sesión.                                                 |
| **Picker**   | Nombre del picker que ejecutó la ruta.                                                   |
| **Sede**     | Nombre de la sede (🏪).                                                                  |
| **Pedidos**  | Lista de números de pedido incluidos, con el primer nombre del cliente entre paréntesis. |
| **Estado**   | Badge de estado: **"💰 Pagado"** (verde) o **"🚧 Pendiente de Pago"** (amarillo).        |
| **Duración** | Tiempo total de la sesión.                                                               |
| **Acción**   | Botones de acción (ver sección 9.3).                                                     |

### 9.3 Acciones disponibles

Para cada sesión del historial tiene dos botones:

- **📄 Ver Logs:** Abre el modal de detalle de la sesión (sección 9.4).
- **📱 Ver Certificado:** Abre el manifiesto/certificado de salida con código QR (sección 13).

### 9.4 Detalle de una sesión histórica

Al tocar **"Ver Logs"**, se abre un modal con toda la información de la sesión:

**Encabezado:**

- **"📋 Detalle de Sesión"** con el ID corto de la sesión.
- Si la sesión fue auditada, aparece un banner verde: **"✓ Sesión Auditada y Completada"** con un botón **"VER CERTIFICADO"**.

**Resumen de la sesión:**

- Hora de inicio y hora de fin.
- Duración total en minutos.
- Nombre del picker y su correo electrónico.

**Estadísticas:**
Tres tarjetas resumen:

- 📦 **Recolectados:** Productos recogidos correctamente.
- 🔄 **Sustituidos:** Productos que fueron reemplazados por otro.
- ❌ **No Encontrados:** Productos que no se encontraron en bodega.

**Detalle por pedido:**
Para cada pedido de la sesión se muestra una tarjeta con:

- Número de pedido y contadores (acciones, sustituciones, no encontrados).
- Datos del cliente: nombre, teléfono, correo, dirección de facturación y envío (si son diferentes).
- Nota del cliente (si existe).
- Lista de productos con:
  - Hora de registro.
  - Imagen del producto.
  - Nombre y código de barras/SKU.
  - Badge de estado: **"✓ Recolectado"** (verde), **"✕ No Encontrado"** (rojo), o **"↳ Sustituto"** (amarillo).
  - Para sustituciones: muestra el producto original tachado, la flecha **"SUSTITUIDO POR"**, la imagen del sustituto, su nombre, precio y badge.
  - Motivo (si el picker registró un motivo de no encontrado).

---

## 10. Gestión de pickers

### 10.1 Cómo acceder

Toque **"Pickers"** en la barra lateral, dentro de la sección **Administración**. El ícono de etiqueta de usuario 🏷️ lo identifica.

### 10.2 Qué ve en esta pantalla

**Encabezado:** El título **"Gestión de Pickers"** con dos botones:

- **Actualizar:** Recarga la lista de pickers.
- **Nuevo Picker:** Abre el formulario de creación (solo visible si usted tiene permisos).

**Tabla de pickers:** Muestra todos los pickers de la sede actual (o de todas las sedes si usted es Super Admin) con las siguientes columnas:

| Columna          | Descripción                                                                                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nombre**       | Avatar con inicial y nombre completo del picker.                                                                                                                                             |
| **Email**        | Correo electrónico.                                                                                                                                                                          |
| **Sede**         | Sede asignada. Para Super Admin, aparece un selector desplegable para cambiar la sede del picker directamente desde la tabla. Para Admin de Sede, aparece un badge con el nombre de la sede. |
| **Estado**       | **"En Ruta"** (badge rojo) si está pickeando, o **"Disponible"** (badge verde).                                                                                                              |
| **Carga Actual** | Si tiene pedidos asignados: muestra el número de pedidos y sus IDs (ejemplo: **"📦 3 Pedidos — #1023, #1024, #1025"**). Si no: muestra un guion.                                             |
| **Acciones**     | Botones de acción (ver sección 10.3).                                                                                                                                                        |

### 10.3 Acciones disponibles

- **✏️ Editar:** Abre el formulario de edición del picker seleccionado. Puede modificar datos personales y la sede.
- **🚫 Liberar Picker (cancelar ruta):** Solo aparece si el picker tiene estado **"En Ruta"**. Cancela la sesión activa del picker, libera todos los pedidos asignados y los devuelve a la fila de pendientes.

**¡Precaución!** Esta es una acción destructiva. Al tocar el botón, aparece un modal de confirmación con fondo rojo:

> **"⚠️ ADVERTENCIA LEGAL DE CANCELACIÓN"**
> Estás a punto de cancelar abruptamente la sesión activa de [nombre]. Esto liberará de golpe N pedido(s) de vuelta a la canasta general.
>
> ¿Proceder de todas formas?

Tiene dos opciones:

- **"Sí, Cancelar Ruta y Liberar Pedidos"** (rojo): Ejecuta la cancelación.
- **"Conservar Asignación"**: Cancela la operación y no hace nada.

Si confirma, el picker queda libre (estado "disponible") y los pedidos vuelven a aparecer en "Por Asignar".

### 10.4 Crear un nuevo picker

Toque **"Nuevo Picker"** en el encabezado. Se abre el formulario de creación con un banner informativo:

- **Si usted es Super Admin:** El banner dice: **"Modo Admin Global: Puedes crear un picker y asignarlo a cualquier sede disponible. Selecciona la sede en el formulario."**
- **Si usted es Admin de Sede:** El banner dice: **"Creación de Picker — Sede [nombre]: El nuevo picker será asignado automáticamente a tu sede [nombre]. No es posible crear pickers para otras sedes desde tu rol de administrador de sede."**

Complete el formulario con los datos del picker y guarde. El sistema crea automáticamente el usuario con rol "picker" y lo asocia a la sede correspondiente.

Para volver a la lista sin guardar, toque **"← Regresar a lista"**.

### 10.5 Cambiar la sede de un picker (solo Super Admin)

En la tabla de pickers, la columna **Sede** muestra un menú desplegable para cada picker. Seleccione la nueva sede y el cambio se aplica inmediatamente. Verá un toast: **"Sede asignada correctamente."**

### 10.6 ¿Qué pasa si no hay pickers registrados?

Verá un estado vacío con un ícono grande y el mensaje:

> **"Aún no hay operarios en esta sede"**
> Crea tu primer Picker usando el botón superior para empezar a asignar recolecciones.

### 10.7 Actualización en tiempo real

La lista de pickers se actualiza automáticamente cuando:

- Un picker cambia de estado (inicia o termina una ruta).
- Se crea o modifica una sesión de picking.

No necesita refrescar la página manualmente, aunque el botón **"Actualizar"** está disponible si lo necesita.

---

## 11. Analítica de pickers — Centro de Inteligencia

### 11.1 Cómo acceder

La sección de analítica está disponible como vista interna del panel. Si está habilitada en la barra lateral, aparece como **"Inteligencia"** con el ícono 📊.

### 11.2 Encabezado y controles

**Título:** **"Centro de Inteligencia"** con la descripción **"Métricas de rendimiento y auditoría de picking en tiempo real"**.

**Controles superiores:**

- **Selector de rango de fecha:** Un menú desplegable que permite filtrar los datos por:
  - 📅 **Hoy**
  - 🗓️ **Últimos 7 días**
  - 📆 **Último Mes**
  - ♾️ **Todo el Historial**
- **Botón "?"** (signo de interrogación): Abre un modal de ayuda que explica cómo se calculan las métricas.
- **Botón "Actualizar Datos":** Recarga todas las métricas.

### 11.3 Pestañas de navegación

Tres pestañas principales:

- **📊 Dashboard General:** Métricas y gráficos de rendimiento.
- **📋 Auditoría Forense:** Log detallado de todas las acciones.
- **🗺️ Analizar Rutas:** Visualización de rutas en el mapa de bodega.

### 11.4 Dashboard General

**a) KPIs Globales (tarjetas superiores):**
Tres tarjetas con métricas resumen:

- **Pedidos Totales:** Cantidad total de pedidos procesados en el rango seleccionado.
- **Eficiencia Global (SPI):** Tiempo promedio por ítem en segundos. SPI = "Seconds Per Item" (Segundos por Producto). Un SPI más bajo indica mayor eficiencia.
- **Tasa de Éxito Global:** Porcentaje de productos recogidos exitosamente (sin fallo). Si supera el 95%, aparece en verde; si no, en naranja.

**b) Gráfico de barras — Ritmo de Trabajo (Pedidos/Hora):**
Un gráfico que muestra cuántos pedidos se procesaron en cada hora del día. Cada barra representa una hora. Al pasar el cursor sobre una barra, aparece un tooltip con el detalle de cuántos pedidos y qué pickers participaron en esa hora.

**c) Comparativa de Velocidad (SPI):**
Un ranking de los 5 pickers más rápidos con barras de progreso. Cada barra muestra el nombre del picker y su SPI en segundos/ítem. El color indica el rango: verde (menos de 60s), amarillo (60-100s), rojo (más de 100s).

**d) Tabla de Rendimiento Detallado:**
Una tabla completa con el ranking de todos los pickers:

| Columna               | Descripción                                                                |
| --------------------- | -------------------------------------------------------------------------- |
| **#**                 | Posición en el ranking.                                                    |
| **Nombre**            | Nombre del picker, total de pedidos, y motivo de fallo más frecuente.      |
| **Eficiencia (SPI)**  | Segundos por ítem.                                                         |
| **Distancia Est.**    | Distancia estimada recorrida en la bodega (en metros).                     |
| **Precisión Global**  | Porcentaje de aciertos con barra visual. Verde si ≥ 98%, naranja si menos. |
| **Pedidos Perfectos** | Porcentaje y conteo de pedidos completados sin errores ni sustituciones.   |

**e) Productos Problemáticos:**
Una cuadrícula de tarjetas para los productos con más incidencias de "no encontrado" o agotados. Cada tarjeta muestra el nombre del producto, cuántas veces se reportó y el motivo más frecuente. Útil para identificar problemas de inventario.

### 11.5 Auditoría Forense

Un log cronológico de todas las acciones registradas en el sistema. Cada entrada muestra:

- **Badge de acción:** Verde (🛒 recolectado), amarillo (🔄 sustituido) o rojo (⚠️ no encontrado).
- **Nombre del producto.**
- **Número de pedido y nombre del picker.**
- **Motivo** (si aplica, en rojo).
- **Fecha y hora exacta** del registro.

### 11.6 Analizar Rutas

**Historial de Rutas Completadas:**
Una cuadrícula de tarjetas donde cada una representa una ruta terminada. Muestra:

- Número de pedido o **"Sesión Conjunta"** si fue multipicker (borde azul y fondo celeste).
- Fecha y hora de finalización.
- Nombre del picker.
- Duración total.
- Enlace **"Ver Recorrido →"**.

Al tocar una tarjeta, se abre el **modal de análisis de ruta** con:

**KPIs de la ruta:**

- Pasillos recorridos.
- Tiempo total de picking.
- Ítems procesados.

**Alertas de ineficiencia:**
Si el sistema detectó retrocesos innecesarios (el picker volvió a un pasillo que ya había visitado), los muestra como alertas.

**Mapa de bodega animado:**
Visualización SVG de la bodega con los 14 pasillos (P1 a P14) dibujados según la distribución real. El mapa muestra:

- El recorrido del picker como una línea de colores (cada pedido tiene un color diferente).
- Un avatar animado (🧑) que se mueve por los pasillos recreando la ruta en tiempo real.
- Controles de reproducción: ▶️ Play, ⏸️ Pausa, ⏮️ Anterior, ⏭️ Siguiente, 🔄 Reiniciar, y selector de velocidad (1×, 2×, 3×).
- En cada parada del recorrido se muestra el nombre del producto y la acción realizada (recolectado, sustituido o no encontrado).

---

## 12. Auditorías pendientes

### 12.1 Cómo acceder

Toque **"Pendiente Auditoría"** en la barra lateral, dentro de la sección **Auditoría**. El ícono de lista de verificación ✔️ lo identifica. El número a la derecha indica cuántas sesiones están esperando que el auditor las revise.

### 12.2 Qué ve en esta pantalla

El encabezado muestra **"🕒 Pendientes de Auditoria"** con un botón **"Refrescar"**.

El contenido es una tabla idéntica a la del historial (ver sección 9.2) pero mostrando únicamente las sesiones que el picker ya finalizó y están esperando la verificación del auditor.

### 12.3 Acciones disponibles

Las mismas que en el historial (sección 9.3):

- **📄 Ver Logs:** Para revisar qué hizo el picker producto por producto.
- **📱 Ver Certificado:** Para ver o imprimir el manifiesto de salida.

### 12.4 ¿Qué pasa si no hay auditorías pendientes?

Verá el mensaje: **"📭 No hay pendientes de auditoria"**.

---

## 13. Pagos pendientes

### 13.1 Cómo acceder

Toque **"Pendiente Pago"** en la barra lateral, dentro de la sección **Pagos**. El ícono de billete 💵 lo identifica. El número a la derecha (en rojo) indica cuántas sesiones están pendientes de pago.

### 13.2 Qué ve en esta pantalla

El encabezado muestra **"💸 Pendientes de Pago"** con un botón **"Refrescar"**.

El contenido es una tabla similar a la del historial, con una diferencia clave: en lugar de la columna "Picker", se muestra la columna **"Cliente(s)"** con los nombres de los clientes de los pedidos.

### 13.3 Acciones disponibles

Además de los botones de Ver Logs y Ver Certificado, cada fila tiene un botón adicional:

- **💰 Pagado:** Inicia el proceso de marcar la sesión como pagada.

### 13.4 Cómo registrar un pago

1. Toque el botón **"💰 Pagado"** en la fila correspondiente.
2. Aparece un modal de confirmación:

> **"💵 Confirmar Recepción de Pago"**
> ¿Confirmas físicamente haber recibido el dinero del picker [nombre]? Una vez procesado, este registro pasará al Historial de Sesiones Finalizadas y no habrá vuelta atrás.

3. Tiene dos opciones:
   - **"Confirmar Pago":** Registra el pago. La sesión pasa al historial con estado "finalizado" (💰 Pagado).
   - **"Volver":** Cancela sin hacer nada.

Después de confirmar, verá el toast: **"✅ Pago registrado con éxito."** y la sesión desaparece de la lista de pendientes de pago.

### 13.5 ¿Qué pasa si no hay pagos pendientes?

Verá el mensaje: **"💰 No hay pedidos pendientes de pago"**.

---

## 14. Manifiesto y facturación — Certificado de salida

### 14.1 Qué es el certificado de salida

El certificado de salida (o manifiesto) es un documento imprimible que resume una sesión de picking auditada. Contiene toda la información necesaria para la caja registradora y para el control de salida de mercancía.

### 14.2 Cómo acceder

Puede abrir el certificado desde:

- El botón **📱 Ver Certificado (QR)** en el historial de sesiones.
- El botón **📱 Ver Certificado** en auditorías pendientes.
- El botón **"VER CERTIFICADO"** dentro del detalle de una sesión auditada.

### 14.3 Qué contiene el certificado

Al abrirlo, verá una vista a pantalla completa diseñada para impresión:

**Botones de acción (parte superior, no se imprimen):**

- **❌ CERRAR:** Cierra el certificado.
- **🖨️ IMPRIMIR:** Abre el diálogo de impresión del navegador.
- Si hay muchos productos, aparece un indicador de densidad: **"📦 N productos - Modo Compacto"** (o Muy Compacto/Ultra Compacto).

**Selector de pedidos:** Si la sesión incluyó múltiples pedidos, aparecen botones para alternar entre ellos (ejemplo: `#1023`, `#1024`).

**Hoja del manifiesto** (contenido imprimible):

Para cada pedido seleccionado:

- **Código QR:** Un código contiene los códigos de barras de todos los productos, formateados para que puedan ser escaneados directamente por la caja registradora. El formato usa multiplicadores de cantidad (ejemplo: `3*7702018956302`) y códigos GS1 de peso variable para productos pesables.
- **Información del pedido:** Número de pedido, nombre del cliente, dirección de entrega, fecha y hora, nombre del picker, y sede.
- **Tabla de productos:** Cada producto con su código de barras, nombre, cantidad y observaciones especiales (sustituciones, multipack, etc.).

### 14.4 ¿Qué pasa si la sesión no tiene certificado?

Si intenta ver el certificado de una sesión que no fue auditada o es muy antigua, verá el toast de advertencia: **"Esta sesión no tiene certificado de salida (no ha sido auditada o es antigua)."**

---

## 15. Mapa de bodega

### 15.1 Qué es

El mapa de bodega es una representación visual de la distribución física del almacén. Se accede desde la sección de Analítica de Rutas (sección 11.6).

### 15.2 Distribución

El mapa refleja la bodega de Girardota con 14 pasillos:

- **Pasillos 1 a 12:** Organizados en 6 columnas de 2 filas (superior e inferior). Cada columna tiene un pasillo arriba y otro abajo.
- **Pasillo 13:** Un bloque vertical a la derecha y una extensión horizontal en la parte superior.
- **Pasillo 14:** Una franja horizontal en la parte inferior de toda la bodega.
- **MESA:** Zona administrativa en la esquina inferior derecha.

El picker se desplaza por los pasillos siguiendo un patrón serpentina: sube por un pasillo, cruza al siguiente, baja, cruza, y así sucesivamente. El mapa muestra las zonas de tránsito entre pasillos (los corredores entre filas).

---

## 16. Preguntas frecuentes y solución de problemas

**¿Los datos se actualizan automáticamente o debo refrescar la página?**
Sí, los datos se actualizan en tiempo real gracias a la conexión con Supabase. Cuando un picker escanea un producto, los cambios se reflejan instantáneamente en el Centro de Comando y en la vista de detalle en vivo. Además hay un refresco automático cada 30 segundos como respaldo. Solo necesita usar el botón "Refrescar" si sospecha que algo no se actualizó.

**¿Puedo asignar el mismo pedido a dos pickers diferentes?**
No. Una vez que un pedido es asignado a una sesión, desaparece de la lista de pendientes. Para que vuelva a estar disponible, debe cancelar la sesión del picker que lo tiene asignado (ver sección 10.3).

**Asigné un pedido por error a un picker equivocado. ¿Qué hago?**
Vaya a **Pickers** en la barra lateral, busque al picker equivocado y toque el botón 🚫 para cancelar su ruta. Los pedidos volverán a la fila de pendientes y podrá reasignarlos al picker correcto.

**Un producto apareció "no encontrado" pero sí hay stock. ¿Puedo corregirlo?**
Desde la vista en vivo de la sesión (sección 8), puede forzar la recolección de un producto pendiente usando el botón de check (✅). Sin embargo, esto solo funciona para productos NO pesables y que aún estén en estado "pendiente" o "parcial".

**¿Puedo anular un producto que el picker ya escaneó?**
Sí. Desde la vista en vivo (sección 8), toque el botón de papelera (🗑️) en cualquier producto, independientemente de su estado. El producto se moverá a la papelera y ya no afectará el resultado de la sesión.

**Anulé un producto por error. ¿Puedo restaurarlo?**
Sí. En la vista en vivo, toque el botón de papelera (🗑️) en el encabezado para ver los productos anulados. Cada uno tiene un botón **"Restaurar"** que lo devuelve a la lista activa del picker.

**¿Qué pasa si el picker cierra la aplicación a mitad de ruta?**
La sesión sigue activa en el servidor. Cuando el picker vuelva a abrir la aplicación, recupera la sesión exactamente donde la dejó. Usted seguirá viendo la sesión en el Centro de Comando.

**¿Puedo cambiar la sede de un picker que está en ruta?**
No es recomendable. Primero cancele la sesión activa del picker, luego cambie su sede, y finalmente asígnele nuevos pedidos de la sede correcta.

**El botón "Ver Certificado" me muestra una advertencia. ¿Por qué?**
Esto ocurre cuando la sesión no fue auditada por el auditor o es una sesión antigua que no tiene snapshot final. El certificado solo se genera después de que el auditor completa la verificación.

**¿Cómo sé si un picker está tardando demasiado?**
En el Centro de Comando, el temporizador de sesión se pone en **rojo** cuando excede los 45 minutos. Además, en la sección de Analítica puede comparar el SPI (Segundos por Ítem) de cada picker contra el promedio global.

**Un pedido nuevo no aparece en "Por Asignar". ¿Qué hago?**
Toque el botón **"Sincronizar"** en la barra de filtros. Esto fuerza una importación fresca desde WooCommerce. Si sigue sin aparecer, verifique en WooCommerce que el pedido tenga el estado correcto (processing) y que la sede esté correctamente detectada.

**¿Qué significa "SPI" en la analítica?**
SPI significa _Seconds Per Item_ (Segundos por Producto). Es el indicador principal de eficiencia de un picker: mide cuánto tiempo promedio le toma procesar un producto. Un SPI más bajo significa que el picker es más rápido. Como referencia: menos de 60 segundos es excelente, entre 60 y 100 es aceptable, y más de 100 requiere atención.

**¿Qué es un "Pedido Perfecto" en la analítica?**
Es un pedido que se completó sin ninguna sustitución y sin productos "no encontrados". Es decir, todos los productos fueron recogidos exactamente como el cliente los pidió.

---

_Fin del Manual del Administrador_
