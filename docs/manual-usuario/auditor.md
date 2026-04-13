# Manual del Auditor — Sistema de Picking

> **Para:** Auditores de calidad en bodega
> **Sede:** Girardota, Antioquia
> **Versión:** 2025

---

## 1. Introducción

El Sistema de Picking incluye un módulo de auditoría donde usted, como auditor, cumple el rol de **última línea de defensa** antes de que los productos salgan de la bodega. Su trabajo consiste en verificar que los productos físicos que el picker recolectó coincidan con lo que el cliente pidió.

El flujo es el siguiente: el picker recorre la bodega, recolecta los productos y al terminar genera un código QR. Usted escanea ese código QR (o ingresa el identificador de la sesión) y el sistema le muestra todo lo que el picker recogió. A partir de ahí, usted verifica una muestra aleatoria de productos escaneando sus códigos de barras. Cuando todos los productos de la muestra están verificados, usted aprueba la salida y el sistema genera el manifiesto de facturación para despacho.

En este manual encontrará, paso a paso, cómo usar cada función del módulo de auditoría: cómo recibir una sesión, cómo verificar productos, cómo interpretar sustituciones, y cómo aprobar la salida final.

---

## 2. Conceptos básicos que debe conocer

**Sesión de picking**
Es el conjunto de pedidos y productos que un picker recolectó en la bodega. Cada sesión tiene un identificador único (una cadena alfanumérica larga). En la pantalla del auditor se muestra abreviado con los primeros 8 caracteres (ejemplo: `#d7a1b3f9`).

**Auditoría**
Es el proceso de verificación que usted realiza sobre una sesión de picking ya completada por el picker. Consiste en revisar una muestra de productos escaneando sus códigos de barras para confirmar que el picker recogió los productos correctos.

**Muestra aleatoria (Smart Sample)**
El sistema no le pide verificar todos los productos de la sesión. En su lugar, selecciona automáticamente una muestra aleatoria de productos para que usted verifique. La cantidad de productos en la muestra depende de cuántos pedidos tiene la sesión: si hay un solo pedido se eligen 3 productos al azar; si hay varios pedidos se eligen 2 productos por cada pedido.

**Producto verificado**
Es un producto de la muestra cuyo código de barras usted ya escaneó y el sistema confirmó que coincide con el producto esperado.

**Producto pendiente**
Es un producto de la muestra que todavía falta por verificar. Aparece en la sección "Pendientes de verificar" con fondo amarillo.

**Producto confiable**
Es un producto que NO fue seleccionado para la muestra aleatoria. El sistema lo considera confiable y no requiere que usted lo escanee. Estos aparecen en la sección colapsable "Productos confiables".

**Producto pesable (Fruver / Carnicería)**
Es un producto que se vende por peso (kilos, libras): frutas, verduras, carnes. Estos productos se verifican automáticamente por el sistema porque el picker ya los validó con etiquetas GS1 durante la recolección. Usted no necesita escanearlos.

**Sustitución**
Cuando el picker no encontró un producto en la bodega y lo reemplazó por otro similar. En la auditoría, los productos sustituidos aparecen con la indicación "PIDIÓ:" (producto original) y "LLEVAS:" (producto sustituto).

**Manifiesto de salida**
Es el documento final que se genera al aprobar la auditoría. Contiene un código QR para la caja registradora, el detalle de todos los productos por pedido, y los datos del cliente. Se puede imprimir directamente desde el navegador.

**Estado "auditado"**
Es el estado final de una sesión después de que usted aprobó la salida. Una vez auditada, la sesión se cierra, el picker queda liberado para nuevas rutas, y los datos se sincronizan automáticamente con WooCommerce.

---

## 3. Ingreso al sistema

### 3.1 Cómo abrir la aplicación

Abra el navegador de su celular, tableta o computador y entre a la dirección que le proporcionó el supervisor. La aplicación carga directamente en la interfaz de auditoría.

### 3.2 Sede

La sede se asigna automáticamente según el usuario registrado en el sistema. En la esquina superior derecha de la pantalla verá el selector de sede si su usuario tiene permisos de administrador global. Si usted es auditor de una sola sede, la sede está fija y no necesita seleccionarla.

### 3.3 Navegación

En la esquina superior izquierda de la pantalla hay un botón con una flecha (←) que le permite volver al panel principal de acceso. El título central dice **"Auditoría"** con un ícono de portapapeles.

---

## 4. Pantalla principal del auditor (Centro de Auditoría)

### 4.1 Qué ve al entrar

Al abrir el módulo de auditoría, usted ve el **Centro de Auditoría**. Esta es la pantalla inicial donde recibe las sesiones para auditar. Tiene las siguientes partes:

**Encabezado fijo (barra superior oscura):**

- A la izquierda: botón de flecha (←) para volver al panel de acceso.
- En el centro: el título **"Auditoría"** con un ícono de portapapeles.
- A la derecha: el selector de sede (solo visible si tiene permisos de administrador global).

**Sección principal (hero):**

- Un ícono de escudo azul grande.
- El título **"Centro de Auditoría"**.
- La descripción: _"Escanea el Código QR de la canasta o ingresa el ID de sesión manualmente para iniciar la validación del pedido."_
- La **barra de escaneo** con tres elementos:
  - **Botón de cámara** (azul, a la izquierda): abre el escáner para leer el código QR de la sesión.
  - **Campo de texto**: donde puede escribir manualmente el ID de la sesión.
  - **Botón de búsqueda** (verde, a la derecha): inicia la búsqueda de la sesión con el ID ingresado.

**Tarjetas educativas (debajo del hero):**
Tres tarjetas informativas que le recuerdan su función:

1. **Validación Rigurosa:** "Verifica que los productos físicos coincidan exactamente con el pedido escaneando sus códigos de barras de forma aleatoria."
2. **Control de Sustitutos:** "Presta especial atención a los productos sustituidos. Garantiza que el cliente reciba un producto de igual o mejor calidad."
3. **Garantía de Calidad:** "Tu rol es la última línea de defensa. Una vez aprobada la salida, generas el código QR maestro para facturación y despacho."

### 4.2 Estado de recuperación automática

Si usted estaba auditando una sesión y cerró el navegador o recargó la página, al volver a abrir la aplicación el sistema recupera automáticamente la sesión que tenía en curso. Esto funciona gracias a que el ID de sesión y su progreso de verificación se guardan localmente en el dispositivo.

---

## 5. Recepción de sesiones para auditar

### 5.1 Escanear el código QR del picker

Cuando el picker termina su ruta, le muestra en su celular un código QR grande. Para recibirlo:

1. En la pantalla del Centro de Auditoría, toque el **botón de cámara** (azul) en la barra de escaneo.
2. Se abre el escáner de códigos. Apunte la cámara al código QR que el picker le muestra.
3. El escáner lee el código automáticamente. El celular vibra brevemente al detectarlo.
4. El sistema busca la sesión correspondiente y carga los datos.

### 5.2 Ingresar el ID de sesión manualmente

Si el escáner no funciona o si tiene el ID de sesión anotado:

1. Toque el campo de texto en la barra de escaneo (dice **"Ej: d7a1b3f9..."**).
2. Escriba el ID de la sesión. Puede escribir el ID completo o solo los primeros caracteres (el sistema busca coincidencias automáticamente).
3. Presione la tecla **Enter** en el teclado o toque el **botón de búsqueda** (verde con ícono de lupa).

### 5.3 Qué pasa después de cargar la sesión

Mientras el sistema consulta los datos, verá el mensaje **"Obteniendo datos de sesión..."**. Cuando termina de cargar, la pantalla cambia completamente y muestra la vista de auditoría con los productos del picker.

### 5.4 ¿Qué pasa si la sesión no se encuentra?

Si el ID ingresado no corresponde a ninguna sesión, verá el mensaje en rojo: **"Sesión vacía o no encontrada."** Verifique que el ID sea correcto. Si escaneó el QR y aparece este error, pídale al picker que recargue su pantalla y vuelva a mostrar el código.

Si ocurre un error de conexión, verá: **"Error consultando la sesión."** Verifique su conexión a internet e intente de nuevo.

---

## 6. Pantalla de auditoría (vista de sesión cargada)

### 6.1 Partes de la pantalla

Una vez cargada la sesión, la pantalla muestra las siguientes secciones de arriba hacia abajo:

**Barra de metadatos (compact meta):**

- A la izquierda: el ID abreviado de la sesión (ejemplo: `#d7a1b3f9`) y el nombre del picker (ejemplo: `👤 Juan Pérez`).
- A la derecha: si la sesión ya tiene un manifiesto previo guardado, aparece un botón con ícono de factura para ver el QR original.

**Barra de progreso:**
Muestra cuántos productos de la muestra ha verificado del total requerido. Por ejemplo: **"2 de 5 verificados"** con un porcentaje (**40%**). La barra se llena de izquierda a derecha en color azul. Cuando todos están verificados, cambia a verde y dice **"✅ Auditoría completa"**.

**Barra de escaneo fija (sticky scanner):**
Debajo de la barra de progreso hay una barra fija que permanece siempre visible mientras hace scroll. Contiene:

- **Botón de cámara:** abre el escáner para verificar productos con la cámara.
- **Campo de texto:** para digitar manualmente el código de barras de un producto.
- **Botón de confirmación** (✓): aparece cuando hay texto en el campo, envía el código.

**Banner de completado:**
Aparece cuando todos los productos de la muestra fueron verificados. Dice: **"¡Todos los productos fueron verificados! Puedes aprobar la salida."** con un ícono de doble check.

**Sección de pedidos:**
Los productos se agrupan por pedido. Cada pedido muestra:

- **Encabezado del pedido:** nombre del cliente (👤), número de pedido, y datos adicionales si están disponibles:
  - 📅 Fecha del pedido.
  - 📞 Teléfono del cliente.
  - ✉️ Correo electrónico.
  - 📍 Dirección de envío.
  - 📝 Nota del cliente (si existe, en un recuadro amarillo).
- **Barra de progreso del pedido:** muestra el avance de verificación para ese pedido específico.
- **Secciones de productos** (ver sección 6.2).

**Historial de picking (colapsable):**
Al final de la página hay un botón **"Historial de picking"** que al tocarlo despliega una línea de tiempo cronológica con todas las acciones que realizó el picker. Cada evento muestra la hora, el tipo de acción (recolectado, sustituido, no encontrado) y el nombre del producto. Los eventos de sustitución muestran el producto original tachado y el sustituto con una flecha.

**Botón flotante inferior:**
En la parte inferior de la pantalla hay un botón grande que cambia según el estado:

- **Mientras faltan productos:** dice **"Faltan N por verificar"** y está desactivado (gris).
- **Cuando todos están verificados:** dice **"APROBAR SALIDA"** con fondo verde y está activo.
- **Cuando la sesión ya fue auditada:** dice **"🏠 Volver al Inicio"** y le permite regresar al Centro de Auditoría.

### 6.2 Secciones de productos dentro de cada pedido

Los productos de cada pedido se dividen en tres secciones:

**1. Pendientes de verificar (fondo amarillo):**
Productos de la muestra que aún no ha verificado. Estos son los que usted debe escanear. Cada tarjeta muestra:

- Imagen del producto (o un ícono de caja si no hay imagen).
- Nombre del producto.
- Si es sustituido: la indicación "PIDIÓ:" con el producto original y "LLEVAS:" con el sustituto.
- Un badge de acción que indica el tipo de verificación requerida:
  - **"🔒 Requerido"**: producto normal que debe escanear.
  - **"⚖️ Escanear etiqueta GS1"**: producto que requiere escaneo de etiqueta GS1 (poco frecuente, ya que los pesables generalmente se auto-verifican).
  - **"👁️ Aprobar Visual"**: producto de fruver o carnes que puede aprobar con un toque visual.
- Cantidad y unidad de medida (ejemplo: `3 UN.`, `1 KL`).
- Si es un multipack (P2, P6, P25, etc.), aparece un badge morado que dice **"📦 xN"** indicando la cantidad de unidades por paquete.

**2. Verificados (fondo verde):**
Productos de la muestra que ya fueron verificados exitosamente con escaneo. Cada tarjeta muestra:

- Imagen del producto.
- Nombre del producto.
- La etiqueta **"✅ Verificado exitosamente"**.
- Cantidad y unidad de medida con fondo verde.

**3. Productos confiables (colapsable):**
Sección con los productos que no fueron seleccionados para la muestra. Está colapsada por defecto. Al tocar el botón **"Productos confiables (N)"** se despliega la lista. Estos productos aparecen con estilo atenuado y no requieren verificación. Sin embargo, si usted escanea un producto confiable, el sistema lo marca igualmente como verificado con un borde verde.

### 6.3 Botón "Salir" de la sesión

En la esquina superior derecha, mientras la sesión está en curso (no auditada), aparece un botón **"Salir"** con un ícono de X. Al tocarlo, el sistema le pregunta:

```
¿Salir de esta sesión? Podrás retomar la auditoría más tarde.
```

Si confirma, vuelve al Centro de Auditoría y la sesión se limpia del dispositivo. Podrá retomarla escaneando o ingresando el mismo ID nuevamente; en ese caso, el progreso se recupera desde el almacenamiento local del navegador.

---

## 7. Proceso de verificación

### 7.1 Verificación por escaneo con cámara

Este es el método principal para verificar productos:

1. En la barra de escaneo fija, toque el **botón de cámara**.
2. Se abre el escáner de códigos de barras.
3. Apunte la cámara al código de barras del producto físico que tiene en la canasta.
4. El escáner lee el código automáticamente y el celular vibra.
5. Si el código coincide con un producto pendiente de verificar, verá una notificación verde en la parte inferior: **"✅ [Nombre del producto] verificado correctamente"**. El producto se mueve de "Pendientes" a "Verificados".
6. Si el código no coincide, verá una notificación roja con el mensaje de error (ver sección 7.4).

### 7.2 Verificación por digitación manual

Cuando el escáner no puede leer el código (por daño, ángulo o iluminación):

1. En la barra de escaneo fija, toque el campo de texto que dice **"Digitar código de barras..."**.
2. Escriba el código numérico del producto con el teclado.
3. Presione **Enter** o toque el botón de confirmación (✓) que aparece a la derecha del campo.
4. El sistema valida el código de la misma forma que el escáner.

### 7.3 Verificación automática de productos pesables

Los productos pesables (fruver, carnes) que el picker ya validó con etiquetas GS1 durante la recolección se verifican automáticamente al cargar la sesión. Usted los verá directamente en la sección de "Verificados" o no aparecerán en los pendientes.

En algunos casos, un producto de fruver puede aparecer como pendiente con el botón **"👁️ Aprobar Visual"**. Esto significa que el sistema necesita que usted confirme visualmente que el producto está correcto. Toque el botón y el producto se marcará como verificado. Verá la notificación: **"✅ Fruver aprobado: [Nombre del producto]"**.

### 7.4 Mensajes de error al verificar

**"El código '[código]' no existe en SIESA."**
El código que escaneó o digitó no se encontró en la base de datos de productos (SIESA). Verifique que esté escaneando el código de barras correcto del producto (no el código del empaque secundario o del proveedor).

**"❌ El código '[código]' es para presentación [X], pero se esperaba [Y]."**
El código corresponde al producto correcto pero en una presentación diferente. Por ejemplo, escaneó el código de la unidad (UND) pero el pedido es por paquete de 6 (P6). Busque el producto en la presentación correcta.

**"❌ El código '[código]' no especifica presentación. Usa un código de barras específico para [X]."**
El código no incluye información de la unidad de medida. Busque un código de barras más específico en el empaque del producto.

**"El código '[código]' existe en SIESA (item [N]), pero no corresponde a ningún producto por validar."**
El código es válido pero no corresponde a ninguno de los productos pendientes de verificar en esta sesión. Puede ser que el producto ya fue verificado, o que no está en la muestra seleccionada.

### 7.5 Retroalimentación sensorial

Al escanear o digitar un código, además del mensaje visual, el celular vibra de forma diferente según el resultado:

- **Código correcto:** vibración corta doble.
- **Advertencia:** vibración media una vez.
- **Error:** vibración larga, pausa, vibración larga.

Los mensajes de notificación aparecen en la parte inferior de la pantalla como un "toast" de color:

- **Verde:** verificación exitosa.
- **Rojo:** error de verificación.
- **Amarillo:** advertencia (por ejemplo, campo vacío).

Estos mensajes desaparecen automáticamente después de 4 segundos.

---

## 8. Tipos de productos en auditoría

### 8.1 Productos normales (por unidad)

Son productos que se venden por unidad (UN, UND). Aparecen en la muestra de verificación con el badge **"🔒 Requerido"**. Para verificarlos, escanee o digite su código de barras. El sistema valida el código contra la base de datos SIESA y confirma que corresponde al producto esperado en la cantidad correcta.

### 8.2 Productos con variaciones (Multipack)

Son productos que tienen presentaciones especiales como P2 (par), P3 (trío), P6 (six pack), P25 (caja de 25), etc. Estos aparecen con un badge morado **"📦 xN"** que le indica cuántas unidades contiene cada empaque.

Al verificar estos productos, el sistema valida no solo que el código del producto sea correcto, sino que la presentación (unidad de medida) también coincida. Si escanea un código de una presentación diferente, el sistema le avisará del error.

### 8.3 Productos pesables (Fruver y Carnicería)

Los productos que se venden por peso (KILO, KL, LIBRA, LB) se verifican automáticamente por el sistema. Esto sucede porque el picker ya los validó durante la recolección escaneando las etiquetas GS1 de la báscula.

Al cargar la sesión, estos productos aparecen directamente como verificados y no le consumen tiempo de auditoría.

En casos excepcionales donde un producto pesable aparezca como pendiente, verá el botón **"👁️ Aprobar Visual"** que le permite confirmar visualmente que el producto está correcto sin necesidad de escanearlo.

### 8.4 Productos sustituidos

Cuando el picker reemplazó un producto original por otro, la tarjeta del producto muestra dos líneas:

- **PIDIÓ:** el nombre del producto que el cliente originalmente pidió.
- **LLEVAS:** el nombre del producto con el que se hizo la sustitución.

La verificación se hace sobre el producto **sustituto** (el que el picker efectivamente puso en la canasta), no sobre el original. Escanee el código de barras del producto sustituto para verificarlo.

Preste especial atención a estos productos. Confirme que el sustituto es de igual o mejor calidad que el original. Si considera que la sustitución no es adecuada, comuníquese con el supervisor antes de aprobar la salida.

---

## 9. Aprobación y cierre de auditoría

### 9.1 Cuándo puede aprobar

Usted puede aprobar la salida cuando **todos** los productos de la muestra de verificación estén marcados como verificados. En ese momento:

- La barra de progreso muestra **100%** y dice **"✅ Auditoría completa"**.
- Aparece el banner verde: **"¡Todos los productos fueron verificados! Puedes aprobar la salida."**
- El botón flotante inferior cambia a **"APROBAR SALIDA"** con fondo verde.

Si faltan productos por verificar, el botón dice **"Faltan N por verificar"** y está deshabilitado.

### 9.2 Proceso de aprobación

1. Toque el botón **"APROBAR SALIDA"**.
2. Aparece una ventana de confirmación del navegador que dice:

```
¿Seguro que deseas liberar esta sesión y generar el QR de salida?
```

3. Toque **Aceptar** para confirmar, o **Cancelar** para volver.
4. Mientras se procesa, el botón cambia a **"APROBANDO..."** con un ícono giratorio. No toque nada mientras carga.
5. Al terminar, el sistema:
   - Cambia el estado de la sesión a **"auditado"**.
   - Libera al picker para que pueda comenzar una nueva ruta.
   - Registra la fecha y hora de la auditoría.
   - Sincroniza los datos del pedido con WooCommerce (se actualizan cantidades, sustituciones y pesos en la tienda en línea).
   - Genera el manifiesto de salida y lo muestra automáticamente (ver sección 10).

### 9.3 ¿Qué pasa si intenta aprobar con productos pendientes?

Si toca el botón de aprobar sin haber verificado todos los productos de la muestra, verá una alerta que dice: **"⚠️ Faltan productos por verificar."** La aprobación no procede; vuelva a la lista y termine de verificar.

---

## 10. Manifiesto / Factura de salida

### 10.1 Qué es el manifiesto

Después de aprobar la salida, la pantalla cambia automáticamente al **Manifiesto de Salida**. Este es un documento diseñado para imprimirse y sirve como comprobante de la mercancía que sale de la bodega.

### 10.2 Partes del manifiesto

**Barra de acciones (no se imprime):**

- Botón **"❌ CERRAR"**: cierra el manifiesto y vuelve al Centro de Auditoría.
- Botón **"🖨️ IMPRIMIR"**: abre el diálogo de impresión del navegador.
- **Indicador de densidad** (si hay muchos productos): muestra cuántos productos tiene y el modo de compactación aplicado (Compacto, Muy Compacto, Ultra Compacto) para que todo quepa en la hoja.

**Selector de pedidos (si la sesión tiene varios pedidos):**
Una fila de botones que le permite navegar entre los diferentes pedidos de la sesión. Cada botón muestra los primeros caracteres del número de pedido. Toque el pedido que desea ver o imprimir.

**Hoja del manifiesto:**
Para cada pedido, la hoja incluye:

- **Encabezado:** nombre del negocio, nombre de la sede, la leyenda "Manifiesto de Salida".
- **Datos del pedido:** número de pedido, fecha y hora de generación, nombre del picker.
- **Datos del cliente:** nombre, dirección de envío, ciudad.
- **Código QR:** contiene la información de todos los productos codificados para que la caja registradora pueda leerlo.
- **Tabla de productos:** lista cada producto con su código (SKU o código de barras), nombre, cantidad, y observaciones. Los productos sustituidos se marcan con la etiqueta "SUSTITUTO" y muestran el nombre del producto original.

### 10.3 Cómo imprimir

1. Una vez en la pantalla del manifiesto, verifique que el pedido correcto esté seleccionado (si hay varios).
2. Toque el botón **"🖨️ IMPRIMIR"**.
3. Se abre el diálogo de impresión del navegador. Seleccione la impresora y confirme.
4. El sistema está optimizado para que el manifiesto quepa en una hoja. Si hay muchos productos, ajusta automáticamente el tamaño de letra y el espaciado.

### 10.4 Cerrar el manifiesto

Al tocar **"❌ CERRAR"**, vuelve al Centro de Auditoría limpio y listo para recibir la siguiente sesión.

### 10.5 Ver manifiesto de sesiones ya auditadas

Si una sesión ya fue auditada previamente y tiene un manifiesto guardado, usted puede volver a verlo:

1. Ingrese el ID de la sesión como normalmente lo haría.
2. En la barra de metadatos (esquina superior derecha), toque el botón con ícono de factura.
3. Se abre nuevamente el manifiesto con los datos originales.

También puede ver el manifiesto si carga una sesión con estado "auditado" — el botón flotante inferior dirá **"🏠 Volver al Inicio"** para cuando termine de revisarlo.

---

## 11. Preguntas frecuentes y solución de problemas

**¿Qué hago si el escáner no lee el código QR del picker?**
Toque el campo de texto en la barra de escaneo e ingrese el ID de sesión manualmente. El picker puede dictárselo leyendo los primeros caracteres de su pantalla. Con 6 a 8 caracteres suele ser suficiente para que el sistema encuentre la sesión.

**¿Puedo verificar un producto que no está en la muestra (sección "confiables")?**
Sí. Si escanea un código de barras que corresponde a un producto de la sección "Productos confiables", el sistema lo marcará como verificado igualmente. Simplemente no es obligatorio.

**¿Qué pasa si escaneo un código y el sistema dice "no corresponde a ningún producto por validar"?**
Revise lo siguiente: (1) que el producto físico sea efectivamente de esta sesión y no de otra canasta; (2) que no haya escaneado un código de empaque secundario en lugar del código del producto; (3) que el producto no haya sido verificado ya — revise la sección "Verificados".

**¿Puedo salir de una auditoría y retomarla después?**
Sí. Toque el botón **"Salir"** en la esquina superior derecha y confirme. Cuando vuelva a ingresar el mismo ID de sesión, el sistema recupera automáticamente su progreso (los productos que ya verificó seguirán verificados).

**¿Puedo auditar varias sesiones al mismo tiempo?**
No. El sistema trabaja con una sesión a la vez. Para cambiar a otra sesión, primero salga de la actual usando el botón **"Salir"**.

**El picker ya se fue pero necesito ver la sesión. ¿Puedo buscarla por el nombre del picker?**
No directamente. Necesita el ID de la sesión. Pídale al supervisor que busque la sesión en el panel de administración (sección "Pendientes de Auditoría") y le proporcione el ID.

**¿Qué hago si la sesión está vacía o no tiene productos?**
Si ve el mensaje **"Sesión vacía o no encontrada"**, significa que la sesión no tiene registros de picking o que el ID es incorrecto. Comuníquese con el supervisor.

**¿Puedo rechazar una sesión y devolvérsela al picker?**
El sistema actual no tiene un botón de "rechazar". Si encuentra un error grave en la canasta (por ejemplo, productos claramente incorrectos), NO apruebe la salida. Salga de la sesión y comuníquese con el supervisor para que tome las medidas necesarias.

**¿Qué pasa si apruebo la salida y después me doy cuenta de un error?**
Una vez aprobada, la sesión pasa a estado "auditado" y se sincroniza con WooCommerce. No se puede deshacer desde la interfaz del auditor. Comuníquese inmediatamente con el supervisor para gestionar la corrección.

**El botón "APROBAR SALIDA" dice "APROBANDO..." y lleva mucho tiempo. ¿Qué hago?**
Espere. El proceso incluye guardar los datos y sincronizar con WooCommerce, lo cual puede tomar algunos segundos dependiendo de la conexión. Si pasan más de 30 segundos, verifique su conexión a internet. Si el error persiste, recargue la página e intente cargar la sesión nuevamente.

**¿Los productos pesables siempre se autoverifican?**
Sí, siempre que el picker los haya registrado correctamente con etiquetas GS1 o con peso ingresado durante la recolección. Si por alguna razón un pesable aparece como pendiente, use el botón **"👁️ Aprobar Visual"** para confirmarlo manualmente.

**¿Cuántos productos tengo que verificar por sesión?**
El sistema selecciona automáticamente una muestra inteligente: 3 productos si hay un solo pedido, o 2 productos por cada pedido si hay varios. La muestra excluye productos pesables (ya autoverificados) y se enfoca en los productos por unidad.

---

_Fin del Manual del Auditor_
