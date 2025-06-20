# Manual de Usuario – DSAR Analyzer

---

## ¿Qué es DSAR Analyzer?
DSAR Analyzer es una aplicación web que permite analizar archivos de logs generados por un sistema de detección de contestadores automáticos basado en redes neuronales. La herramienta facilita la visualización, filtrado y análisis de resultados de pruebas, permitiendo identificar aciertos, errores y llamadas derivadas a agentes.

---

## 1. Carga de Archivos de Log

### ¿Cómo cargar archivos?
- Haz clic en el botón **"Seleccionar Archivos"** o arrastra y suelta uno o varios archivos `.log` o `.txt` en la zona de carga.
- Los archivos seleccionados aparecerán listados debajo, mostrando su nombre y tamaño.
- Puedes eliminar archivos de la lista antes de procesar si lo deseas.

### ¿Qué se puede analizar aquí?
- Puedes analizar uno o varios archivos de logs a la vez, incluso de diferentes fechas o pruebas.
- El sistema sumará y analizará todas las llamadas de todos los archivos cargados.

---

## 2. Procesamiento de Logs

### ¿Cómo procesar los archivos?
- Una vez seleccionados los archivos, haz clic en **"Procesar Logs"**.
- Verás un indicador de carga mientras se procesan los archivos.
- Al finalizar, se mostrarán los resultados en el dashboard y las tablas.

### ¿Qué se puede analizar aquí?
- El sistema extrae y analiza todas las llamadas, detectando el audio esperado, el audio detectado, la probabilidad de acierto y si la llamada fue derivada a un agente.

---

## 3. Dashboard de Métricas

### ¿Qué muestra?
- **Total Llamadas:** Número total de llamadas analizadas.
- **Tasa de Acierto:** Porcentaje de llamadas donde el audio detectado coincide con el esperado.
- **Canales Activos:** Número de canales diferentes utilizados en las llamadas.
- **Tiempo Promedio:** Tiempo promedio de detección del audio.

### ¿Qué se puede analizar aquí?
- Rápida visualización del rendimiento global de la red neuronal y del sistema de pruebas.

---

## 4. Gráficos Interactivos

### ¿Qué muestran?
- **Aciertos vs Errores:** Gráfico de dona que muestra la proporción de llamadas correctas e incorrectas.
- **Rendimiento por Canal:** Gráfico de barras que muestra aciertos y errores por cada canal.

### ¿Qué se puede analizar aquí?
- Identificar si hay canales con más errores o si el sistema tiene un buen desempeño general.

---

## 5. Tabla de Detalle de Llamadas

### ¿Qué muestra?
- **Fecha/Hora:** Momento de inicio de la llamada.
- **Canal:** Canal utilizado.
- **Audio Esperado:** Audio que se esperaba detectar (según el número marcado).
- **Audio Detectado:** Audio que realmente detectó la red neuronal.
- **Probabilidad:** Porcentaje de confianza de la detección.
- **Estado:** Si la llamada fue un acierto o un error.
- **Causa Corte:** Motivo de finalización de la llamada.
- **Duración:** Tiempo total de la llamada.

### ¿Qué se puede analizar aquí?
- Revisar cada llamada individualmente.
- Filtrar y buscar llamadas específicas por canal, audio, estado, etc.
- Identificar patrones de error o llamadas atípicas.

---

## 6. Análisis por Audio Esperado

### ¿Qué muestra?
- **Audio Esperado:** El audio que se intentó detectar.
- **Total Llamadas:** Cuántas veces se probó ese audio.
- **Aciertos/Errores:** Cantidad de veces que se detectó correctamente o no.
- **Tasa de Acierto:** Porcentaje de éxito para ese audio.
- **Detalles:** Botón para ver el detalle de todas las llamadas de ese audio.

### ¿Qué se puede analizar aquí?
- Identificar qué audios son más problemáticos para la red neuronal.
- Ver si hay audios que nunca se detectan correctamente.
- Analizar el rendimiento por tipo de audio.

---

## 7. Modal de Detalles por Audio

### ¿Qué muestra?
- **Hora, Canal, Detectado, Probabilidad, Estado:** Detalle de cada llamada para ese audio.
- **Derivada a Agente:** Indica "Sí" si la llamada terminó sin detección final (N/A), es decir, fue derivada a un agente.

### ¿Qué se puede analizar aquí?
- Ver en detalle cada intento de detección para un audio específico.
- Identificar si los errores se deben a derivaciones a agentes o a fallos de la red neuronal.
- Analizar la probabilidad de detección en cada caso.

---

## 8. Interpretación de Resultados

- **Acierto:** El audio detectado coincide con el esperado.
- **Error:** El audio detectado no coincide, o no hubo detección final.
- **Derivada a Agente:** Llamada que no tuvo detección final y fue transferida a un agente.

---

## 9. Recomendaciones de Uso

- Analiza siempre varios archivos para obtener una visión global.
- Usa los filtros y la búsqueda para encontrar patrones o problemas específicos.
- Presta atención a los audios con baja tasa de acierto y a los canales con más errores.
- Utiliza la columna "Derivada a Agente" para diferenciar entre errores reales y transferencias normales.

---

## 10. Limitaciones y Consejos

- El análisis depende de la calidad y formato de los logs. Si hay líneas atípicas, pueden no ser procesadas.
- Si ves N/A en "Detectado", revisa si la llamada fue derivada a un agente o si hubo un problema en la detección.
- Si faltan audios esperados, revisa que los MAKE_CALL estén correctamente formateados en los logs.

---
