# Guía de Operación: Instalación, Ejecución y Despliegue

Este documento contiene las instrucciones necesarias para que un usuario en un entorno **Linux (Ubuntu)** pueda levantar el frontend de Jurisprudencia CGR, tanto en desarrollo como en producción.

## 1. Requisitos Previos
Asegúrese de tener instalados los siguientes componentes:
- **Node.js**: Versión 18 o superior.
- **npm**: Gestor de paquetes de Node.
- **Wrangler CLI**: Herramienta de Cloudflare para desarrollo y despliegue.

```bash
# Instalar Node.js y npm (si no los tiene)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instalar Wrangler globalmente
npm install -g wrangler
```

## 2. Instalación del Proyecto Frontend
Navegue al directorio del frontend e instale las dependencias:

```bash
cd github/cgr/frontend
npm install
```

## 3. Ejecución en Desarrollo (Local)
Para trabajar localmente con recarga en vivo (hot reload) y previsualización de las Cloudflare Functions:

```bash
# Iniciar el servidor de desarrollo de Vite
npm run dev

# OPCIONAL: Si desea probar las Functions de la API localmente con bindings
npx wrangler pages dev ./dist --compatibility-date=2024-01-01 --d1 DICTAMENES_DB=<DB_ID> --kv DICTAMENES_SOURCE=<KV_ID> --kv DICTAMENES_PASO=<KV_ID>
```

## 4. Preparación para Producción
Antes de desplegar, debe generar el "build" optimizado:

```bash
npm run build
```
Esto creará una carpeta `dist/` con todos los archivos estáticos listos para ser servidos.

## 5. Despliegue a Cloudflare Pages
El proyecto está diseñado para correr en **Cloudflare Pages**.

### Configuración en el Dashboard de Cloudflare:
1. Vaya a **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
2. Seleccione el repositorio y apunte al directorio `frontend/`.
3. **Build settings**:
   - Framework preset: `Vite`
   - Build command: `npm run build`
   - Build output directory: `dist`
4. **Variables de Entorno / Bindings**:
   En la configuración del proyecto Pages, asegúrese de vincular:
   - **D1 Database**: Enlace `DICTAMENES_DB` a su base de datos real.
   - **KV Namespace**: Enlace `DICTAMENES_SOURCE` y `DICTAMENES_PASO` a sus respectivos namespaces.

### Despliegue por CLI (Direct Upload):
Si prefiere desplegar sin conectar Git:
```bash
npx wrangler pages deploy dist --project-name cgr-jurisprudencia
```

## 6. Comandos Útiles
- `npm run lint`: Ejecuta el analizador de código para detectar errores.
- `npm run preview`: Previsualiza el build de producción localmente.

---
*Nota: El uso de Cloudflare es fundamental para la seguridad y escalabilidad de este frontend.*
