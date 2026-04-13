# Manual del Picker — Sistema de Picking

> **Para:** Operadores de bodega (pickers)
> **Sede:** Girardota, Antioquia
> **Versión:** 2025

---

## 1. Introducción

El Sistema de Picking es una aplicación que usted usa en su celular o tableta para saber qué productos debe recoger en la bodega para los pedidos de los clientes. El sistema le muestra una lista de productos, uno por uno, con la ubicación dentro de la bodega (el pasillo), la cantidad que necesita recoger, y el nombre del cliente que lo pidió.

Su trabajo como picker es recorrer la bodega siguiendo esa lista, escanear o validar cada producto que encuentra, y registrarlo en la aplicación. Cuando termina con todos los productos, el sistema genera un código que le muestra al auditor para que apruebe la salida.

En este manual usted encontrará, paso a paso, cómo usar cada función de la aplicación: cómo iniciar, cómo escanear productos, qué hacer cuando no hay un producto, cómo manejar productos que se pesan, y qué hacer si se va el internet.

---

## 2. Conceptos básicos que debe conocer

**Sede**
Es el punto de distribución donde usted trabaja. El sistema puede tener varias sedes. La suya aparece siempre en la parte superior de la pantalla. Usted solo ve los pedidos y productos de su sede.

**Sesión de picking (Ruta)**
Es el conjunto de pedidos y productos que el supervisor le asignó para recoger en un turno. El sistema la llama "Ruta Activa". Una sesión puede incluir pedidos de varios clientes al mismo tiempo.

**Pedido**
Es el listado de productos que un cliente compró en la tienda en línea. Un pedido tiene un número único. En la sesión puede haber varios pedidos de clientes diferentes, todos agrupados en la misma ruta.

**Producto pesable**
Es un producto que no se vende por unidades sino por peso: kilos, libras o gramos. Por ejemplo: frutas, verduras, carnes, pollo, pescado. Para estos productos el sistema le pedirá ingresar el peso en lugar de escanear una cantidad fija.

**Sustitución**
Cuando un producto no está disponible en la bodega, usted puede reemplazarlo por otro producto similar. A esto se le llama "sustituir". El sistema le ayuda a buscar el producto de reemplazo y a validarlo.

**Modo offline**
Cuando la aplicación no tiene señal de internet, entra en modo offline. Usted puede seguir trabajando y escaneando productos normalmente. La aplicación guarda todo lo que usted hace y lo sube al servidor en cuanto vuelva la conexión.

---

## 3. Ingreso al sistema

### 3.1 Cómo abrir la aplicación

Abra el navegador de su celular o tableta y entre a la dirección que le dio el supervisor. La aplicación carga directamente en la pantalla de picking; no necesita instalar nada.

### 3.2 Selección de sede

La sede se asigna automáticamente según el usuario registrado en el sistema. Usted no necesita seleccionarla manualmente. En la parte superior de la pantalla verá el nombre de su sede (por ejemplo: **Girardota**).

### 3.3 Inicio de sesión

La aplicación reconoce su usuario automáticamente usando el correo electrónico que el supervisor registró para usted. Si su usuario no es reconocido, verá un mensaje de error que dice:

```
Error al iniciar
```

En ese caso, toque el botón **Reintentar**. Si el error persiste, comuníquese con el supervisor.

Cuando el sistema lo reconozca correctamente y le haya sido asignada una ruta, pasará directamente a la pantalla principal. Si todavía no tiene una ruta asignada, verá la pantalla de espera (ver sección 4.1).

---

## 4. Pantalla principal del picker

### 4.1 Qué ve al entrar

Puede encontrarse con una de tres situaciones al abrir la aplicación:

**a) Sin ruta asignada:**
Verá un mensaje que dice **"Sin Ruta Asignada"** con una canasta animada en el centro. La aplicación verifica automáticamente cada 5 segundos si el supervisor le asignó algo nuevo. También verá un indicador giratorio que dice **"Verificando asignaciones..."**. Hay un botón **Actualizar** por si desea revisar manualmente. No necesita hacer nada más; espere a que el supervisor asigne la ruta.

**b) Con ruta activa:**
Verá la pantalla principal con la lista de productos para recoger. (Ver sección 4.2)

**c) Ruta finalizada esperando auditoría:**
Verá la pantalla de código QR (Ver sección 11.2).

### 4.2 Partes de la pantalla

La pantalla principal tiene las siguientes secciones, de arriba hacia abajo:

**Barra de estado (parte muy superior):**
Muestra el nombre de su sede y el estado de la conexión a internet. Cuando tiene internet dice **"Conectado"** con un ícono de señal Wi-Fi. Cuando no tiene internet dice **"Offline"** junto con el número de acciones pendientes de subir. Si está subiendo datos dice **"Subiendo..."** con un ícono giratorio.

**Encabezado (cabecera fija):**
- **Ruta Activa:** El número de identificación de su sesión (los primeros 6 caracteres).
- **Temporizador:** Un reloj que muestra cuánto tiempo lleva trabajando desde que escaneó el primer producto. Antes de escanear el primero dice **"Esperando primer producto..."**.
- **Botón Clientes:** Un botón con ícono de teléfono que dice **"Clientes"**. Al tocarlo, ve los datos de contacto de los clientes.
- **Contador de items:** Muestra cuántos productos ya están en la canasta versus el total (ejemplo: `3 / 12 Items`).
- **Leyenda de pedidos:** Una fila de colores que identifica cada pedido. Cada pedido tiene una letra (A, B, C...) y un color diferente para que usted sepa a quién pertenece cada producto.
- **Barra de progreso:** Una barra que muestra el porcentaje de avance de su ruta (ejemplo: `3 de 12 productos — 25%`).
- **Notas de los clientes:** Si algún cliente dejó instrucciones especiales para su pedido, aparecen aquí en un recuadro amarillo con el nombre del cliente y la nota.

**Pestañas de navegación:**
Dos pestañas que permiten cambiar entre la lista de productos:
- **Pendientes:** Los productos que todavía le faltan por recoger. Muestra el número de productos pendientes.
- **Canasta:** Los productos que ya recogió o registró. Muestra el número de productos en canasta.

**Lista de tarjetas de productos:**
El cuerpo de la pantalla muestra las tarjetas de cada producto. Cada tarjeta es una fila con la información del producto y los botones para trabajar con él.

**Botón TERMINAR RUTA:**
Aparece en la parte inferior únicamente cuando todos los productos están en la pestaña **Canasta** (es decir, cuando no quedan pendientes). Tocarlo inicia el proceso de cierre de la sesión.

### 4.3 Cómo leer la información del pedido

Cada tarjeta de producto muestra:

- **Imagen del producto** (si existe). Al tocarla, se amplía para verla mejor.
- **Pasillo:** Un rótulo que indica en qué pasillo de la bodega está el producto (ejemplo: `PASILLO P3`). Si el producto no tiene pasillo asignado, dice `GENERAL`.
- **Categoría:** Debajo del pasillo aparece la categoría del producto (ejemplo: `Lácteos • Quesos`).
- **Cantidad solicitada:** Un número grande con la unidad de medida en la esquina superior derecha de la tarjeta (ejemplo: `3 UN`, `1.5 KILO`, `2 LIBRA`).
- **Alerta MULTIPACK:** Si el producto es un multipack (DÚO, TRIPACK, SIXPACK, DOCENA, etc.), aparece un aviso naranja que dice, por ejemplo: `ATENCIÓN: LLEVAR SIXPACK`. Preste atención a esto porque significa que debe llevar el empaque múltiple completo.
- **Nombre del producto** y precio.
- **Instrucción Especial:** Si el cliente dejó una nota específica para ese producto (por ejemplo: "Que sea maduro"), aparece bajo el nombre con el ícono de un bloc de notas.
- **Rótulos de pedido:** Pequeños recuadros de color con la letra del pedido (A, B, C...), la cantidad que ese cliente necesita y el primer nombre del cliente. Si el producto aparece en el pedido de un cliente que recoge en el local (domicilio no), verá un ícono de persona caminando.

---

## 5. Iniciar una sesión de picking

### 5.1 Ver los pedidos asignados

Cuando el supervisor crea una sesión y la asigna a usted, la aplicación la detecta automáticamente (sin necesidad de que usted haga nada). La pantalla de **"Sin Ruta Asignada"** desaparece y aparece la pantalla principal con todos los productos de la ruta.

En el encabezado verá la leyenda de colores con los pedidos incluidos en su ruta. Por ejemplo, si tiene dos pedidos:
- **A** (azul): Carlos
- **B** (naranja): María

Eso significa que en esta ruta hay productos para Carlos y para María al mismo tiempo. Los productos de Carlos tienen un rótulo azul con la letra A; los de María, un rótulo naranja con la letra B.

### 5.2 Comenzar a pickear un pedido

No hay un botón de "iniciar". La sesión comienza en el momento en que usted escanea o registra el primer producto. En ese momento el temporizador en el encabezado empieza a contar.

Empiece por la pestaña **Pendientes** y trabaje de arriba hacia abajo, siguiendo el orden de pasillos que el sistema le muestra.

---

## 6. Pickear productos (flujo normal)

### 6.1 Ver el producto que debe buscar

En la pestaña **Pendientes**, cada tarjeta le indica exactamente qué buscar:
- El **pasillo** donde está (ejemplo: `PASILLO P2`).
- El **nombre** del producto.
- La **cantidad** que necesita recoger.
- A **quién** pertenece (rótulo de color con la letra del pedido).

### 6.2 Escanear el código de barras

En la tarjeta del producto encontrará un botón grande en el lado derecho. Para productos normales (no pesables) el botón dice **SCAN** con un ícono de código de barras. Tóquelo para abrir la cámara.

Apunte la cámara al código de barras del producto. El sistema lo leerá automáticamente. Si el código es correcto, verá un mensaje de confirmación en la parte inferior de la pantalla (un aviso verde que dice **"¡Código correcto! ✅"** o **"¡Recolección completada! 🎉"**).

Si el código no coincide con el producto esperado, verá un aviso rojo que dice **"❌ Código [número] no coincide."** y el celular vibrará. Verifique que esté escaneando el producto correcto. Si es el producto correcto pero el sistema no lo acepta, use el ingreso manual (ver sección 8.3).

### 6.3 Confirmar la cantidad

**Productos de 4 unidades o menos:** Cuando el escaneo es exitoso, cada escaneada cuenta como una unidad. Escanee tantas veces como unidades deba recoger.

**Productos de más de 4 unidades:** Cuando escanea el primero exitosamente, el sistema abre automáticamente una ventana que dice **"¿Cuántas unidades encontraste?"**. Verá el campo con el número de unidades que faltan ya llenado. Si encontró todas, simplemente toque **✅ Confirmar**. Si encontró menos, cambie el número y confirme. El sistema no le permitirá ingresar más unidades de las que faltan.

### 6.4 Marcar el producto como pickeado

Cuando la cantidad escaneada llega al total pedido, el producto pasa automáticamente de la pestaña **Pendientes** a la pestaña **Canasta**. No necesita tocar ningún botón adicional.

### 6.5 Pasar al siguiente producto

Una vez que el producto desaparece de **Pendientes**, simplemente pase al siguiente de la lista. Continue así hasta que la lista de **Pendientes** esté vacía.

---

## 7. Productos pesables (fruver, carnicería)

### 7.1 Cómo identificar un producto pesable

Un producto es pesable cuando su unidad de medida es **KILO**, **LIBRA** o similar (KG, KL, LB). Esto aparece en el badge de cantidad en la esquina superior derecha de la tarjeta. Por ejemplo: `1.5 KILO` o `2 LIBRA`.

Además, en la tarjeta, el botón de acción no dice **SCAN** sino **PESAR** con un ícono de balanza.

El sistema distingue dos tipos de productos pesables:
- **Fruver** (frutas, verduras, y otros productos de báscula que no son carne): usted ingresa el peso en gramos manualmente.
- **Carnicería** (carnes, pollo, pescado, embutidos, mariscos, camarones): usted escanea la etiqueta que imprime la báscula de carnicería.

### 7.2 Cómo ingresar el peso — Fruver

1. Toque el botón **PESAR** en la tarjeta del producto.
2. Se abre la ventana de pesaje. En la parte superior verá el nombre del producto y la cantidad solicitada (ejemplo: `Solicitado: 1 Kg (≈ 1000g)`).
3. El sistema carga automáticamente el código del producto desde SIESA. Mientras carga, dice **"Configurando producto..."**. Espere a que termine.
4. Una vez cargado, verá un campo para ingresar el peso en gramos. Escríbalo con el teclado numérico (ejemplo: si pesó 950 gramos, escriba `950`). El campo acepta máximo 5 dígitos.
5. A medida que escribe, el sistema muestra el **"Código final"** que se va a generar automáticamente. No necesita entender ese número; es solo para control.
6. Toque **✅ Confirmar** para registrar el producto.

**Atención:** Si el peso que ingresa es más del doble de lo que el cliente pidió, el sistema le mostrará un aviso de alerta. Si el peso es correcto (por ejemplo, el cliente pidió 1 Kg pero el producto más pequeño pesa 2.1 Kg), toque **✅ Confirmar** una segunda vez para confirmar que es intencional.

**Si el sistema no encuentra el código SIESA** del producto, verá el mensaje: **"No se encontró código GS1 en SIESA para este producto. Contacta al supervisor."** En ese caso no podrá registrar el producto usted mismo; debe avisar al supervisor.

### 7.3 Cómo registrar carnes y productos de carnicería

1. Toque el botón **PESAR** en la tarjeta del producto.
2. Se abre la ventana con el título **"Validar y Pesar Cárnico"**.
3. Verá un campo con el texto de ayuda: **"Ej: 2915132001000"**. Aquí debe ingresar la etiqueta que imprime la báscula de carnicería. Puede hacerlo de dos formas:
   - **Escaneando:** Toque el ícono de cámara y apunte al código de barras de la etiqueta de la báscula.
   - **Digitando:** Escriba el número completo de la etiqueta en el campo y toque **Validar**.
4. Si la etiqueta es válida, el campo se bloquea (ya no se puede editar) y aparece un recuadro verde que dice **"Etiqueta GS1 Aprobada"** con el código y el peso extraído en kilogramos.
5. Toque **✅ Confirmar** para registrar el producto.

**Si la etiqueta no es válida**, verá el mensaje: **"❌ Debes escanear o digitar la etiqueta GS1 completa (13 o 14 dígitos)."** Verifique que esté usando la etiqueta correcta que imprime la báscula (no el código de barras de la empacadora del proveedor).

---

## 8. Escaneo de códigos de barras

### 8.1 Cómo usar el escáner

1. Toque el botón **SCAN** (o el botón **PESAR** para productos pesables) en la tarjeta del producto.
2. Se abre la cámara del celular.
3. Apunte la cámara al código de barras del producto, procurando que esté bien iluminado y enfocado.
4. El sistema detecta el código automáticamente; no necesita tocar ningún botón para capturar.
5. Si el código es correcto, escucha una vibración corta y ve el mensaje de confirmación. Si es incorrecto, la vibración es más larga y aparece un mensaje rojo.

### 8.2 Qué hacer si no reconoce el código

Si el escáner no lee el código (por ejemplo, por el ángulo, la iluminación o el estado del código), intente lo siguiente:

- Acérquese o aléjese un poco del código de barras.
- Mejore la iluminación.
- Si el código de barras está arrugado o dañado, use el ingreso manual (ver sección 8.3).

Si el escáner lee el código pero el sistema lo rechaza con el mensaje **"❌ Código no coincide"**, verifique que el producto que tiene en la mano sea el mismo que aparece en la tarjeta. Si está seguro de que es el mismo producto pero diferente presentación (tamaño, empaque), consulte al supervisor.

### 8.3 Ingreso manual del código

Cuando el escáner no funciona, usted puede digitar el código manualmente:

1. En la tarjeta del producto, toque el botón pequeño **DIGITAR** (con ícono de teclado). Este botón solo está disponible para productos no pesables.
2. Se abre una ventana con el título **"Digitar Código"** y el campo de texto listo para escribir.
3. Escriba el código EAN o SKU del producto (el número del código de barras) y toque **✅ Validar**.
4. Si el código es correcto, el sistema continúa el flujo normal (pesa o registra según el tipo de producto). Si es incorrecto, verá un aviso rojo.

> **Nota:** El ingreso manual valida el código exactamente igual que el escáner. No puede ingresar un código cualquiera; debe ser el código real del producto.

---

## 9. Sustituciones (cuando no hay el producto)

### 9.1 Cuándo hacer una sustitución

Cuando busca un producto en la bodega y no lo encuentra, o cuando hay menos unidades de las que el cliente pidió, usted tiene la opción de sustituirlo por otro producto similar.

Hay dos formas de llegar a la sustitución:
- **Sustitución total:** Toque el botón pequeño **CAMBIAR** (con ícono de flechas cruzadas) en la tarjeta. Esto sustituye todas las unidades que faltan.
- **Sustitución parcial:** Si ya escaneó algunas unidades del producto original pero no puede completar el total, toque el botón **NO HAY** (con ícono de prohibición). El sistema le preguntará si desea buscar un sustituto para las que faltan, o enviar el pedido incompleto.

### 9.2 Cómo sustituir un producto paso a paso

**Paso 1 — Buscar el sustituto:**

Al abrir la ventana de sustitución, verá:
- El nombre del producto original (el que no encontró).
- La cantidad que necesita sustituir.
- Una lista de **Sugerencias (Mismo Pasillo)**: productos del mismo pasillo que el sistema recomienda como reemplazo.

Si alguno de los sugeridos sirve, toque **Elegir** en ese producto. Si ninguno sirve, puede buscar otro:
- Escriba el nombre del producto en el campo de búsqueda y toque el ícono de lupa para buscar.
- O toque el ícono de cámara para escanear el código de barras del producto que quiere usar como sustituto.

Los productos que aparecen con **"Sin Stock"** tienen el botón **Elegir** desactivado; no puede elegirlos.

**Paso 2 — Validar el sustituto:**

Una vez que elige un producto, el sistema le pide que lo confirme escaneando o digitando su código:

- **Productos por unidad:** Aparece el campo **"Escanear código de barras"**. Escanee el código del producto sustituto con la cámara (toque el ícono de cámara) o digítelo manualmente. Toque **✅ Confirmar**.
- **Carnes sustitutas (pesables):** Aparece el campo **"Escanear Etiqueta GS1"**. Escanee la etiqueta de la báscula para el producto sustituto. Cuando sea válida, aparece el mensaje **"Sustituto Aprobado"** con el peso extraído. Luego toque **✅ Confirmar**.
- **Fruver sustituto:** El sistema valida el código automáticamente (no pide escaneo). Solo debe ingresar el peso en gramos en el campo que aparece y tocar **✅ Confirmar**.

Si el código que ingresa no corresponde al producto sustituto seleccionado, verá el mensaje **"❌ Código incorrecto. Verifica que estés escaneando el producto correcto."** y el celular vibrará.

Para volver a la lista de sugerencias sin confirmar, toque **Atrás**.

### 9.3 Qué pasa después de sustituir

El producto sustituido pasa a la pestaña **Canasta**. Su tarjeta muestra la información del cambio:

- Si fue una sustitución total (cero unidades del original): verá tachado el nombre del producto original y debajo el nombre del sustituto con la etiqueta **"LLEVAS:"**.
- Si fue una sustitución parcial (algunas unidades del original y otras del sustituto): verá dos líneas, **ORIGINAL: X un.** y **SUSTITUTO: Y un.**

---

## 10. Modo offline (sin internet)

### 10.1 Qué es y cuándo ocurre

El modo offline ocurre cuando el celular o tableta pierde la conexión a internet (ya sea por mala señal, zona sin cobertura, o porque el Wi-Fi se cayó). La aplicación lo detecta automáticamente y muestra en la barra de estado superior: **"⚠️ Offline (N)"**, donde N es el número de acciones que están esperando para enviarse.

### 10.2 Qué puede y qué no puede hacer sin internet

**Puede hacer con total normalidad:**
- Escanear productos y registrarlos.
- Registrar pesos de productos pesables de fruver.
- Marcar productos como no encontrados.
- Realizar sustituciones.
- Ver la lista de productos pendientes y la canasta.

**No puede hacer sin internet:**
- Validar códigos de productos mediante digitación manual (el sistema le preguntará si desea forzar el registro sin validar; hágalo solo si está seguro de que el producto es el correcto).
- Finalizar la ruta y generar el código para el auditor (el botón **TERMINAR RUTA** le advertirá que hay sincronizaciones pendientes y no le permitirá terminar hasta que vuelva la conexión).

### 10.3 Cómo se sincroniza cuando vuelve la conexión

Usted no necesita hacer nada. En el momento en que el celular vuelve a tener internet, la aplicación envía automáticamente todo lo que usted hizo mientras estaba sin conexión. Verá en la barra superior el mensaje **"Subiendo..."** con un ícono giratorio mientras esto ocurre. Cuando termina de subir, regresa a **"Conectado"**.

**Importante:** No cierre la aplicación ni recargue la página mientras dice **"Subiendo..."**. Espere a que termine para asegurarse de que todo quede guardado.

---

## 11. Finalizar un pedido y cerrar la sesión

### 11.1 Cuándo está listo para cerrar

La sesión se puede cerrar cuando todos los productos han pasado de **Pendientes** a **Canasta**. En ese momento, la lista de **Pendientes** queda vacía y el mensaje **"¡Ruta Completada! Todos los productos están en la canasta"** aparece en esa pestaña.

### 11.2 Finalizar la sesión de picking

Cuando todos los productos están en la canasta, aparece en la parte inferior de la pantalla el botón grande **"TERMINAR RUTA"**.

**Antes de tocarlo, verifique:**
- Que la barra de estado dice **"Conectado"** (no **"Offline"**).
- Que no dice **"Subiendo..."** (espere a que termine de sincronizar).

Si hay acciones pendientes de subir, al tocar **TERMINAR RUTA** verá el aviso: **"⚠️ Tienes N sincronizaciones pendientes. Conéctate a internet."** En ese caso, espere a tener internet y vuelva a intentarlo.

Cuando todo está sincronizado, al tocar **TERMINAR RUTA** aparece una ventana de confirmación con el mensaje:

```
¿Finalizar recorrido?
¿Estás seguro de que deseas cerrar esta sesión de
recolección y generar el código para auditoría?
```

Tiene dos opciones:
- **Sí, Terminar:** Confirma y cierra la sesión.
- **Volver a la canasta:** Cancela y vuelve sin hacer nada.

### 11.3 Qué pasa después

Cuando confirma la finalización, la pantalla cambia completamente y muestra:
- El mensaje **"¡Ruta Finalizada!"**
- Un **código QR grande** en el centro de la pantalla.
- El texto: **"Muestra este código al auditor."**
- Un ícono de candado con el texto: **"Bloqueado por seguridad — Esperando aprobación de salida..."**

Muéstrele ese código QR al auditor para que pueda escanear y aprobar su salida. La pantalla permanece bloqueada hasta que el auditor apruebe. Cuando el auditor lo aprueba, el celular vibra y la aplicación vuelve automáticamente a la pantalla de inicio lista para una nueva ruta.

**No cierre la aplicación mientras espera al auditor.** Si cierra y vuelve a abrir, el código QR seguirá ahí hasta que el auditor apruebe.

---

## 12. Funciones adicionales

### 12.1 Directorio de clientes

En el encabezado hay un botón **Clientes** (con ícono de teléfono). Al tocarlo, se abre una ventana con los datos de los clientes de los pedidos de su ruta actual. Para cada cliente ve:
- El nombre del cliente.
- El número de su pedido.
- Si el cliente tiene teléfono registrado: un botón de llamada directa y un botón de WhatsApp para contactarlo.

Esta función es útil si necesita verificar algún detalle del pedido con el cliente.

### 12.2 Ver la imagen del producto en grande

Si la tarjeta de un producto tiene imagen, puede tocarla para verla ampliada en una ventana de zoom. Esto le ayuda a identificar exactamente qué producto buscar en la bodega. Para cerrar la imagen ampliada, toque fuera de ella.

### 12.3 Deshacer (Devolver a pendientes)

Si un producto ya está en la **Canasta** pero cometió un error (por ejemplo, escaneó el producto equivocado o ingresó mal el peso), puede devolverlo a **Pendientes**. En la pestaña **Canasta**, cada tarjeta tiene un botón de deshacer (ícono de flecha curva). Al tocarlo, el sistema le pregunta qué desea hacer:

**Para productos pesables (fruver/carnes):**
- Solo hay una opción: **"Devolver y borrar peso"**. Esto borra el peso registrado y devuelve el producto a **Pendientes**.

**Para productos por unidad completamente escaneados:**
- Solo hay una opción: **"Devolver desde cero"**. La cantidad escaneada vuelve a 0.

**Para productos parcialmente escaneados:**
- **"Mantener progreso (X/Y)":** Devuelve el producto a **Pendientes** pero conserva las unidades que ya escaneó. Solo quedan pendientes las que faltan.
- **"Empezar desde cero (0/Y)":** Borra todo y empieza de cero.

---

## 13. Preguntas frecuentes y problemas comunes

**¿Qué hago si la aplicación dice "Error al iniciar"?**
Toque el botón **Reintentar**. Si el error sigue, avise al supervisor; es posible que su usuario no esté registrado correctamente en el sistema.

**¿Qué hago si la pantalla muestra "Sin Ruta Asignada" y llevo mucho tiempo esperando?**
La aplicación verifica automáticamente cada 5 segundos. Puede tocar el botón **Actualizar** para verificar de inmediato. Si sigue sin asignación, comuníquese con el supervisor para que le cree la sesión.

**¿Puedo pickear productos en cualquier orden o debo seguir el orden de la lista?**
Puede trabajar en el orden que prefiera, pero la lista está organizada por pasillos para ayudarle a recorrer la bodega de forma eficiente. Se recomienda seguir el orden sugerido.

**El escáner leyó el código pero dijo "❌ Código no coincide". ¿Qué hago?**
Verifique que el producto en su mano sea exactamente el mismo que aparece en la tarjeta (mismo nombre, misma presentación). Si está seguro de que es correcto, puede intentar el ingreso manual tocando **DIGITAR**. Si el sistema tampoco lo acepta manualmente, avise al supervisor.

**¿Puedo escanear varios productos del mismo tipo a la vez sin escanear uno por uno?**
Para productos de más de 4 unidades, el sistema abre automáticamente la ventana de cantidad masiva después del primer escaneo. Allí puede indicar cuántas unidades encontró de una vez.

**¿Qué pasa si un producto no tiene imagen en la tarjeta?**
Aparece un ícono de caja vacía en lugar de la foto. En ese caso use el nombre del producto y el código SKU para identificarlo en la bodega.

**La aplicación dice "Offline" pero sé que tengo internet. ¿Qué hago?**
Intente recargar la página del navegador. Si vuelve a conectarse normalmente, siga trabajando. Si el problema persiste, avise al supervisor o al soporte técnico.

**¿Puedo finalizar la ruta si todavía tengo productos en "Pendientes"?**
No. El botón **TERMINAR RUTA** solo aparece cuando todos los productos están en la **Canasta**. Si un producto no pudo ser recogido ni sustituido, use el botón **NO HAY** para marcarlo como no encontrado, lo que lo moverá a la **Canasta** con ese estado.

**¿Qué hago si el auditor todavía no llega y la pantalla del código QR se queda cargando?**
Espere. La pantalla de código QR permanece activa hasta que el auditor apruebe o el supervisor gestione la sesión. No cierre la aplicación. El celular vibrará cuando el auditor apruebe.

**¿Qué pasa si el sistema notifica "⚠️ ATENCIÓN: El cliente pidió X Kg y estás ingresando Y Kg"?**
El sistema detectó que el peso ingresado es más del doble del solicitado. Verifique que escribió el peso correctamente (recuerde que es en gramos). Si el peso es correcto (por ejemplo, el producto más pequeño disponible pesa mucho más de lo pedido), toque **✅ Confirmar** una segunda vez para confirmar que es intencional.

---

*Fin del Manual del Picker*
