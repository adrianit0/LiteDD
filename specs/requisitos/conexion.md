# Requisitos de conexión a MySQL

> Extraído de `specs/ESPECIFICACION.md`. Si este fichero y aquel difieren tras un cambio aprobado, manda este y se registra un ADR.

LiteDD usa una única conexión a un servidor MySQL 8.4 y un esquema por defecto que se elige una vez.

| ID | Requisito |
|---|---|
| C-01 | El diálogo «Conexión» tiene: método (fijo, TCP/IP estándar), host (por defecto 127.0.0.1), puerto (3306), usuario, contraseña (se guarda), esquema por defecto y parámetros JDBC adicionales. |
| C-02 | Sin conexión configurada, la barra superior muestra un aviso que no bloquea. Las notas funcionan sin conexión. |
| C-03 | «Probar conexión» conecta y lista los esquemas con `SHOW DATABASES`, sin los de sistema (information_schema, mysql, performance_schema, sys). |
| C-04 | Esquema por defecto: si solo hay un esquema que no sea de sistema, se selecciona solo. Si hay varios, hay que elegir uno de la lista. La elección se recuerda. |
| C-05 | URL: `jdbc:mysql://<host>:<puerto>/<esquema>` con `useSSL=false`, `allowPublicKeyRetrieval=true`, `characterEncoding=UTF-8`, `allowMultiQueries=false`, `tinyInt1isBit=false`, `zeroDateTimeBehavior=CONVERT_TO_NULL` y `connectTimeout=5000`. Los parámetros adicionales se añaden después; allowMultiQueries no se puede activar. |
| C-06 | `allowPublicKeyRetrieval=true` es necesario para autenticar con caching_sha2_password sin SSL, el método por defecto de MySQL 8.4. |
| C-07 | Pool HikariCP: máximo 3 conexiones, mínimo 0 inactivas, sentencia inicial de solo lectura (S-04), vida máxima de 10 minutos y espera máxima de 5 s. |
| C-08 | No se usa autoReconnect del driver. El pool valida cada conexión antes de entregarla. |
| C-09 | La barra superior indica el estado: conectado (usuario, host y esquema), desconectado o esquema no disponible. Un clic abre el diálogo. «Reconectar» recrea el pool. |
| C-10 | Si el esquema guardado no existe al conectar, el estado es «esquema no disponible». Se reintenta en la siguiente ejecución o al pulsar «Reconectar». |
| C-11 | Cambiar la conexión cierra el pool anterior y cancela las consultas en curso. |

Formato de connection.json:

```json
{
  "host": "127.0.0.1",
  "port": 3306,
  "user": "<usuario>",
  "password": "<contraseña>",
  "schema": "litedd_demo",
  "extraParams": ""
}
```
