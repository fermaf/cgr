# Wrappers de skills heredadas

Esta carpeta reserva la convención para envolver capacidades de `cgr-platform` sin duplicar su lógica.

Reglas:

- el wrapper vive en `agents/skills/wrappers/`;
- el nombre público no debe colisionar con skills nativas;
- el wrapper sólo adapta contrato, contexto y telemetría;
- la implementación heredada se importa desde afuera, sin modificar `cgr-platform` internamente;
- cuando exista duda entre copiar o envolver, se prefiere envolver.
