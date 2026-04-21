# Backfill dry-run pjo_dictamenes

Fecha: 2026-04-11T20:48:36.794Z

## Resumen

- Filas candidatas leidas: 396
- Inserts propuestos: 396
- PJOs cubiertos: 20
- Roles: rector=20, fundante=39, aplicativo=193, historico=15, contextual=129
- Por estado auditoria: util_incompleto=274, sospechoso=122

Este dry-run no escribe en D1. Genera un SQL revisable en `cgr-platform/scripts/backfill_pjo_dictamenes.generated.sql`.

## Resumen por PJO

| PJO | Regimen | Auditoria | Total | Rector | Fundante | Aplicativo | Historico | Contextual |
|---|---|---|---:|---:|---:|---:|---:|---:|
| pjo-006554n19 | regimen-006554n19: Fijación de Plantas de Personal Municipal: Normativa y Procedimientos | util_incompleto | 28 | 1 | 2 | 13 | 2 | 10 |
| pjo-006785n20 | regimen-006785n20: Límites competenciales de alcaldes en emergencia sanitaria COVID-19 | util_incompleto | 10 | 1 | 2 | 5 | 0 | 2 |
| pjo-011000n17 | regimen-011000n17: Instrucciones sobre Participación Ciudadana en Planes Reguladores | util_incompleto | 3 | 1 | 1 | 1 | 0 | 0 |
| pjo-012084n17 | regimen-012084n17: Ilegalidad de normas urbanísticas basadas en vías en el PRC | sospechoso | 16 | 1 | 2 | 9 | 2 | 2 |
| pjo-012605n16 | regimen-012605n16: Probidad administrativa en fundaciones creadas por entes públicos | util_incompleto | 12 | 1 | 2 | 5 | 0 | 4 |
| pjo-014923n17 | regimen-014923n17: Fiscalización de fondos públicos en instituciones de educación superi... | util_incompleto | 8 | 1 | 2 | 1 | 0 | 4 |
| pjo-015806n16 | regimen-015806n16: Revisión de legalidad en otorgamiento de pensiones de gracia a ex tra... | util_incompleto | 9 | 1 | 2 | 4 | 1 | 1 |
| pjo-015919n17 | regimen-015919n17: Improcedencia de creación de cuerpos policiales por Municipalidades | util_incompleto | 10 | 1 | 2 | 4 | 0 | 3 |
| pjo-017500n16 | regimen-017500n16: Reapertura de sumario y pago de remuneraciones en sector municipal | sospechoso | 41 | 1 | 2 | 8 | 0 | 30 |
| pjo-018671n19 | regimen-018671n19: Bloqueo en redes sociales por PDI sin normativa vulnera derechos | util_incompleto | 13 | 1 | 2 | 8 | 1 | 1 |
| pjo-024531n17 | regimen-024531n17: Adjudicación de licitación pública y criterios de evaluación | sospechoso | 11 | 1 | 2 | 6 | 0 | 2 |
| pjo-028330n17 | regimen-028330n17: Instrucciones sobre prescindencia política en período electoral | util_incompleto | 40 | 1 | 2 | 15 | 3 | 19 |
| pjo-048164n16 | regimen-048164n16: Humedales como áreas bajo protección oficial para el SEIA | util_incompleto | 15 | 1 | 2 | 9 | 1 | 2 |
| pjo-062697n15 | regimen-062697n15: Titularidad docente y servicios a honorarios bajo Ley 20.248 | sospechoso | 9 | 1 | 2 | 5 | 0 | 1 |
| pjo-086450n16 | regimen-086450n16: Instrucciones sobre reajuste de remuneraciones y beneficios 2016 | util_incompleto | 31 | 1 | 2 | 8 | 0 | 20 |
| pjo-092238n16 | regimen-092238n16: Inhabilidad por percepción de bono de retiro y nulidad de nombramiento | util_incompleto | 8 | 1 | 2 | 3 | 0 | 2 |
| pjo-e156769n21 | regimen-e156769n21: Confianza legítima en contratas: renovación y término anticipado | sospechoso | 45 | 1 | 2 | 35 | 2 | 5 |
| pjo-e173171n22 | regimen-e173171n22: Reinterpretación de contratación a honorarios en Administración Públi... | util_incompleto | 46 | 1 | 2 | 26 | 3 | 14 |
| pjo-e516610n24 | regimen-e516610n24: Instructivo sobre Ley Karin en prevención de acoso y violencia laboral | util_incompleto | 11 | 1 | 2 | 5 | 0 | 3 |
| pjo-e58945n20 | regimen-e58945n20: Vulneración normativa en permiso de edificación y PRC Las Condes | util_incompleto | 30 | 1 | 2 | 23 | 0 | 4 |

## Muestras por PJO

### pjo-006554n19

- Regimen: regimen-006554n19 - Fijación de Plantas de Personal Municipal: Normativa y Procedimientos
- Pregunta: ¿Puede una municipalidad modificar su planta de personal y encasillar a sus funcionarios sin cumplir estrictamente con los límites presupuestarios, los requisitos de idoneidad técnica y el procedimiento de consulta con las asociaciones de funcionarios establecido en la Ley N° 20.922 y la Ley N° 18.695?
- 1. E512533N24 (rector, 1) - Límite gasto personal municipal excluye ingresos por percibir
- 2. 006554N19 (fundante, 0.98) - Fijación de Plantas de Personal Municipal: Normativa y Procedimientos
- 3. 030352N92 (fundante, 0.82) - 
- 4. 017773N18 (aplicativo, 0.85) - Instrucciones sobre fijación o modificación de plantas municipales
- 5. 041238N17 (aplicativo, 0.84) - Plazo inicial para fijar plantas municipales según Ley 20.922
- 6. 036318N17 (aplicativo, 0.82) - Quórum de acuerdos municipales y vicios de legalidad en adjudicación
- 7. 001627N19 (aplicativo, 0.81) - Destino de ingresos por impuesto a casinos de juego en municipios
- 8. 085233N16 (aplicativo, 0.81) - Cálculo límite gasto personal municipal y remuneración del alcalde
- ... 20 candidatos adicionales

### pjo-006785n20

- Regimen: regimen-006785n20 - Límites competenciales de alcaldes en emergencia sanitaria COVID-19
- Pregunta: ¿Pueden los alcaldes dictar medidas sanitarias restrictivas o de control de movilidad que excedan las facultades otorgadas por la normativa nacional durante una emergencia sanitaria, o bien, deben limitarse estrictamente a las competencias establecidas en la Ley Orgánica Constitucional de Municipalidades y las directrices de la autoridad sanitaria central?
- 1. E113751N21 (rector, 1) - Instrucciones CGR para traspaso y probidad en gestión municipal 2021
- 2. 006785N20 (fundante, 1) - Límites competenciales de alcaldes en emergencia sanitaria COVID-19
- 3. 035220N99 (fundante, 0.82) - 
- 4. 009762N20 (aplicativo, 0.84) - Competencias sanitarias y seguro laboral en pandemia COVID-19
- 5. 0E8935N20 (aplicativo, 0.8) - Facultades municipales y fiscalización sanitaria en pandemia
- 6. 000261N21 (aplicativo, 0.78) - Alcaldes en medios: límites y fiscalización de jornada laboral
- 7. 003000N17 (aplicativo, 0.78) - Colaboración municipal en zonas de catástrofe fuera de su territorio
- 8. 000085N21 (aplicativo, 0.73) - Ilegalidad reapertura centro comercial en estado de catástrofe
- ... 2 candidatos adicionales

### pjo-011000n17

- Regimen: regimen-011000n17 - Instrucciones sobre Participación Ciudadana en Planes Reguladores
- Pregunta: ¿Es obligatorio para las municipalidades garantizar instancias de participación ciudadana adicionales a las audiencias públicas formales durante el proceso de elaboración o modificación de los Planes Reguladores Comunales, y cómo debe la Administración asegurar la transparencia y publicidad de las observaciones recibidas por parte de la comunidad?
- 1. 010084N20 (rector, 1) - Participación digital en IPT durante emergencia sanitaria
- 2. 011000N17 (fundante, 1) - Instrucciones sobre Participación Ciudadana en Planes Reguladores
- 3. 043367N17 (aplicativo, 0.84) - Edificación continua sin altura máxima en IPT: improcedencia

### pjo-012084n17

- Regimen: regimen-012084n17 - Ilegalidad de normas urbanísticas basadas en vías en el PRC
- Pregunta: ¿Puede una Municipalidad condicionar la aplicación de normas urbanísticas de un Plan Regulador Comunal a la ejecución de vías o aperturas de calles que no han sido efectivamente materializadas o expropiadas, afectando así el derecho de edificación de los propietarios de los terrenos involucrados?
- 1. 004373N19 (rector, 1) - Incompatibilidad de normas locales con beneficios de fusión predial
- 2. 012084N17 (fundante, 0.9) - Ilegalidad de normas urbanísticas basadas en vías en el PRC
- 3. 034617N13 (fundante, 0.74) - 
- 4. 041250N17 (aplicativo, 0.75) - Rechazo reconsideración normas PRC Las Condes vs LGUC y OGUC
- 5. 040156N17 (aplicativo, 0.75) - Límites constructivos en áreas verdes complementarias PRMS
- 6. 040730N17 (aplicativo, 0.73) - Invalidez de incentivos urbanísticos en PRC de Santiago
- 7. 018871N17 (aplicativo, 0.71) - Reconsideración del Plano Seccional 'El Venado' en San Pedro de La Paz
- 8. 024795N18 (aplicativo, 0.68) - Fusión predial previa y cumplimiento de normas en permisos de obra
- ... 8 candidatos adicionales

### pjo-012605n16

- Regimen: regimen-012605n16 - Probidad administrativa en fundaciones creadas por entes públicos
- Pregunta: ¿Puede una municipalidad u otro ente público crear o participar en fundaciones privadas para eludir las normas de control administrativo, presupuestario y de probidad que rigen a la Administración del Estado, o bien, deben dichas entidades sujetarse estrictamente a los principios de transparencia y rendición de cuentas aplicables a los recursos públicos?
- 1. D60N26 (rector, 1) - Incompatibilidad retiro voluntario en sociedades vinculadas a universidades estatales
- 2. 012605N16 (fundante, 0.99) - Probidad administrativa en fundaciones creadas por entes públicos
- 3. 034889N96 (fundante, 0.82) - 
- 4. E235694N22 (aplicativo, 0.84) - Fiscalización de corporaciones municipales culturales y deportivas
- 5. E160316N21 (aplicativo, 0.84) - Corporaciones municipales sujetas a normativa administrativa estatal
- 6. E316441N23 (aplicativo, 0.8) - Aplicación ley 19.886 a corporaciones municipales con fondos propios
- 7. 012278N17 (aplicativo, 0.76) - Reconsideración de Dictamen N° 12.605 sobre Responsabilidad de Fundación Universitaria
- 8. 044475N17 (aplicativo, 0.74) - Obligatoriedad de dictámenes y plazos en sumarios administrativos
- ... 4 candidatos adicionales

### pjo-014923n17

- Regimen: regimen-014923n17 - Fiscalización de fondos públicos en instituciones de educación superior
- Pregunta: ¿Están las instituciones de educación superior que reciben aportes estatales obligadas a rendir cuenta ante la Contraloría General de la República por el uso de dichos fondos, y posee el ente contralor facultades fiscalizadoras sobre el destino y administración de tales recursos públicos?
- 1. 005452N20 (rector, 1) - Reconsideración parcial gratuidad y aranceles excedidos en educación superior
- 2. 014923N17 (fundante, 1) - Fiscalización de fondos públicos en instituciones de educación superior
- 3. 021324N90 (fundante, 0.82) - 
- 4. 021855N18 (aplicativo, 0.81) - Fiscalización de fondos públicos en universidades privadas
- 5. 005245N15 (contextual, 0.34) - 
- 6. 061018N12 (contextual, 0.34) - 
- 7. 040417N12 (contextual, 0.34) - 
- 8. 003234N06 (contextual, 0.34) - 

### pjo-015806n16

- Regimen: regimen-015806n16 - Revisión de legalidad en otorgamiento de pensiones de gracia a ex trabajadores
- Pregunta: ¿Puede la Administración del Estado otorgar pensiones de gracia a ex trabajadores de empresas del sector público o privado basándose exclusivamente en la condición de ex empleado, o debe acreditarse el cumplimiento de los requisitos legales específicos de carencia y mérito establecidos en la normativa vigente para este beneficio?
- 1. E372372N23 (rector, 1) - Ratificación de cumplimiento en pensiones de gracia a extrabajadores ENACAR
- 2. 015806N16 (fundante, 0.99) - Revisión de legalidad en otorgamiento de pensiones de gracia a ex trabajadores
- 3. 003440N03 (fundante, 0.82) - 
- 4. E315698N23 (aplicativo, 0.8) - Reconsideración denegada en pensiones de gracia para extrabajadores
- 5. E260052N22 (aplicativo, 0.76) - Pensiones gracia ENACAR: límites de fiscalización y reserva administrativa
- 6. 088296N15 (aplicativo, 0.75) - Contratación de la Fundación Chile para PRAS sin licitación pública
- 7. 088477N15 (aplicativo, 0.72) - Reconsideración de Pensiones de Gracia a Ex Trabajadores del Carbón
- 8. 052977N16 (historico, 0.6) - Revisión de pensiones de gracia a ex trabajadores de ENACAR S.A.
- ... 1 candidatos adicionales

### pjo-015919n17

- Regimen: regimen-015919n17 - Improcedencia de creación de cuerpos policiales por Municipalidades
- Pregunta: ¿Tienen las Municipalidades la facultad legal para crear, organizar o financiar cuerpos policiales, guardias armadas o unidades de seguridad con atribuciones de orden público y seguridad ciudadana, o bien, dicha competencia es privativa de las fuerzas de orden y seguridad pública dependientes del Ministerio del Interior y Seguridad Pública?
- 1. E30601N25 (rector, 1) - Legalidad uso elementos seguridad inspectores municipales
- 2. 015919N17 (fundante, 0.98) - Improcedencia de creación de cuerpos policiales por Municipalidades
- 3. 012287N02 (fundante, 0.82) - 
- 4. E53858N20 (aplicativo, 0.84) - Asociaciones municipales y seguridad pública en Providencia
- 5. 002659N21 (aplicativo, 0.83) - BRIOP Las Condes: Límites constitucionales a funciones municipales en orden público
- 6. 036481N17 (aplicativo, 0.81) - Límites a la creación de unidades municipales de seguridad
- 7. E161091N21 (aplicativo, 0.79) - Atribuciones municipales en seguridad pública y defensa personal
- 8. 075296N13 (contextual, 0.34) - 
- ... 2 candidatos adicionales

### pjo-017500n16

- Regimen: regimen-017500n16 - Reapertura de sumario y pago de remuneraciones en sector municipal
- Pregunta: ¿Corresponde que un municipio ordene la reapertura de un sumario administrativo para el pago de remuneraciones devengadas durante el periodo de separación del servicio, cuando el acto administrativo que dispuso la destitución fue invalidado o dejado sin efecto por la propia autoridad edilicia o por una resolución judicial?
- 1. 024731N19 (rector, 1) - Prescripción infracciones ley 19.913: plazo de 5 años por analogía civil
- 2. 017500N16 (fundante, 0.92) - Reapertura de sumario y pago de remuneraciones en sector municipal
- 3. 051817N04 (fundante, 0.74) - 
- 4. 094190N14 (aplicativo, 0.73) - Designación de exdirectores en dotación docente y cargos directivos
- 5. 014938N15 (aplicativo, 0.71) - Reconsideración de dictamen sobre proceso sancionatorio municipal
- 6. 003263N19 (aplicativo, 0.68) - Reconsideración de dictamen sobre extemporaneidad de reclamo municipal
- 7. 077245N15 (aplicativo, 0.68) - Reconsideración de sumario administrativo en Municipalidad de Cauquenes
- 8. 098414N15 (aplicativo, 0.66) - Rechazo de propuesta de obra por incompetencia de la Dirección de Obras Hidráulicas
- ... 33 candidatos adicionales

### pjo-018671n19

- Regimen: regimen-018671n19 - Bloqueo en redes sociales por PDI sin normativa vulnera derechos
- Pregunta: ¿Puede la Policía de Investigaciones de Chile bloquear a ciudadanos en sus cuentas oficiales de redes sociales, impidiendo el acceso a la información pública o la interacción con la institución, en ausencia de una normativa legal expresa que faculte dicha restricción?
- 1. E23732N25 (rector, 1) - Uso de redes sociales institucionales y vínculos con cuentas personales
- 2. 018671N19 (fundante, 1) - Bloqueo en redes sociales por PDI sin normativa vulnera derechos
- 3. 071422N13 (fundante, 0.82) - 
- 4. 006696N20 (aplicativo, 0.84) - Uso de redes sociales por autoridades y bloqueo de usuarios
- 5. E109649N21 (aplicativo, 0.81) - Uso de redes sociales por autoridades y bloqueo de usuarios
- 6. 011171N20 (aplicativo, 0.81) - Legalidad consulta ciudadana sobre escultura en costanera Puerto Montt
- 7. E21324N20 (aplicativo, 0.81) - Bloqueo de usuarios en cuentas personales de autoridades públicas
- 8. 020451N19 (aplicativo, 0.81) - Bloqueo en Twitter institucional vulnera derecho a información pública
- ... 5 candidatos adicionales

### pjo-024531n17

- Regimen: regimen-024531n17 - Adjudicación de licitación pública y criterios de evaluación
- Pregunta: ¿Puede una entidad pública modificar los criterios de evaluación establecidos en las bases de una licitación pública una vez que el proceso ha sido convocado, o debe ceñirse estrictamente a los factores de ponderación y exigencias técnicas originalmente publicados para garantizar la igualdad de los oferentes?
- 1. E343820N23 (rector, 1) - Revocación de licitación por seguridad informática sin fundamento preciso
- 2. 024531N17 (fundante, 0.89) - Adjudicación de licitación pública y criterios de evaluación
- 3. 016142N10 (fundante, 0.74) - 
- 4. 015331N18 (aplicativo, 0.72) - Revocación de licitación pública por error en bases y validez de nuevas bases
- 5. 001395N21 (aplicativo, 0.7) - Adjudicación licitación municipal no ajustada a derecho por criterios discrecionales
- 6. 004314N17 (aplicativo, 0.69) - Inadmisibilidad de oferta en licitación por incumplimiento de requisitos técnicos
- 7. E180684N22 (aplicativo, 0.65) - Adjudicación licitación ajustada a criterios objetivos y bases
- 8. 013573N18 (aplicativo, 0.61) - Rechazo de reconsideración en licitación pública por falta de nuevos antecedentes
- ... 3 candidatos adicionales

### pjo-028330n17

- Regimen: regimen-028330n17 - Instrucciones sobre prescindencia política en período electoral
- Pregunta: ¿Puede un funcionario público, en el ejercicio de sus funciones o utilizando recursos estatales, realizar actividades de propaganda, proselitismo o manifestar preferencias políticas durante el período electoral, o bien, intervenir de cualquier forma en el proceso eleccionario para favorecer o perjudicar a una candidatura?
- 1. E376048N23 (rector, 1) - Competencia SERVEL en fiscalización de probidad electoral
- 2. 028330N17 (fundante, 0.99) - Instrucciones sobre prescindencia política en período electoral
- 3. 030039N93 (fundante, 0.82) - 
- 4. 024529N19 (aplicativo, 0.83) - Deberes de prescindencia política en funcionarios públicos
- 5. 086368N16 (aplicativo, 0.8) - Verificación de asistencia y permisos en la Gobernación Provincial de Valparaíso
- 6. 079472N16 (aplicativo, 0.8) - Reconsideración de Oficio sobre Publicidad Municipal en Peñalolén
- 7. 043286N17 (aplicativo, 0.79) - Uso de bienes municipales para difusión no institucional
- 8. 075618N16 (aplicativo, 0.78) - Uso de bases de datos municipales para fines políticos en Providencia
- ... 32 candidatos adicionales

### pjo-048164n16

- Regimen: regimen-048164n16 - Humedales como áreas bajo protección oficial para el SEIA
- Pregunta: ¿Corresponde someter obligatoriamente al Sistema de Evaluación de Impacto Ambiental (SEIA) a los proyectos o actividades que se pretendan ejecutar en humedales, aun cuando estos no hayan sido declarados formalmente como áreas bajo protección oficial por un acto administrativo específico?
- 1. E318970N23 (rector, 1) - Consulta indígena en permisos de edificación en ADI Atacama La Grande
- 2. 048164N16 (fundante, 0.98) - Humedales como áreas bajo protección oficial para el SEIA
- 3. 026138N12 (fundante, 0.82) - 
- 4. E39766N20 (aplicativo, 0.86) - Áreas de preservación ecológica en PRMS como protección oficial
- 5. 025713N19 (aplicativo, 0.84) - Protección oficial de humedales Ramsar y acto administrativo
- 6. 000276N19 (aplicativo, 0.82) - Límites de la potestad normativa municipal en protección de humedales
- 7. 023683N17 (aplicativo, 0.81) - Ingreso al SEIA de proyectos en áreas bajo protección oficial
- 8. 011759N17 (aplicativo, 0.81) - Competencia de Direcciones de Obras Municipales y SEIA
- ... 7 candidatos adicionales

### pjo-062697n15

- Regimen: regimen-062697n15 - Titularidad docente y servicios a honorarios bajo Ley 20.248
- Pregunta: ¿Es posible que un docente que ostenta la titularidad en una dotación municipal, en virtud de la Ley N° 20.248, desempeñe simultáneamente funciones bajo la modalidad de contrato a honorarios en el mismo sostenedor para realizar labores propias de la función docente?
- 1. 030619N16 (rector, 1) - Desestimación de solicitud de titularidad docente por incumplimiento de requisitos
- 2. 062697N15 (fundante, 0.9) - Titularidad docente y servicios a honorarios bajo Ley 20.248
- 3. 057520N09 (fundante, 0.74) - 
- 4. 034838N15 (aplicativo, 0.75) - Alcance de la titularidad docente según la ley N° 20.804
- 5. 045875N12 (aplicativo, 0.75) - Régimen jurídico personal Subvención Escolar Preferencial (SEP)
- 6. 097827N15 (aplicativo, 0.72) - Rechazo de solicitud de titularidad docente por incumplimiento de requisitos legales
- 7. 073309N15 (aplicativo, 0.71) - Titularidad docente y exclusión de servicios a honorarios
- 8. 073301N15 (aplicativo, 0.67) - Acceso a titularidad docente bajo Ley 20.804: Requisitos y cómputo de tiempo
- ... 1 candidatos adicionales

### pjo-086450n16

- Regimen: regimen-086450n16 - Instrucciones sobre reajuste de remuneraciones y beneficios 2016
- Pregunta: ¿Corresponde aplicar los reajustes de remuneraciones y los beneficios económicos establecidos en las leyes 20.975 y 20.971 a los funcionarios públicos, incluyendo aquellos sujetos a regímenes especiales, y cómo debe efectuarse el cálculo de dichos incrementos sobre las remuneraciones imponibles y no imponibles según la normativa vigente?
- 1. 001389N18 (rector, 1) - Reajuste remuneracional ley 20.975 y exclusión por tope
- 2. 086450N16 (fundante, 1) - Instrucciones sobre reajuste de remuneraciones y beneficios 2016
- 3. 016756N07 (fundante, 0.82) - 
- 4. 002405N17 (aplicativo, 0.8) - Alcance del límite de remuneraciones para reajuste sector público
- 5. 047403N16 (aplicativo, 0.79) - Revisión de remuneraciones y contratos de trabajo en Corporación de Asistencia Judicial
- 6. 031764N13 (aplicativo, 0.79) - Régimen de aguinaldos y naturaleza imponible en ASMAR
- 7. 039770N17 (aplicativo, 0.78) - Reajuste remuneracional ley 20.975 y límite de $4.400.000
- 8. 023863N17 (aplicativo, 0.77) - Reclamo de pago de bono de vacaciones y legalidad de descuento en finiquito
- ... 23 candidatos adicionales

### pjo-092238n16

- Regimen: regimen-092238n16 - Inhabilidad por percepción de bono de retiro y nulidad de nombramiento
- Pregunta: ¿Puede un exfuncionario público que percibió una bonificación por retiro voluntario ser nombrado nuevamente en un cargo de la Administración del Estado sin haber restituido previamente los fondos recibidos, o dicha situación constituye una inhabilidad sobreviniente que acarrea la nulidad de su nuevo nombramiento?
- 1. E370771N23 (rector, 1) - Inhabilidad post empleo en LGPA y nulidad de nombramiento
- 2. 092238N16 (fundante, 1) - Inhabilidad por percepción de bono de retiro y nulidad de nombramiento
- 3. 032624N08 (fundante, 0.82) - 
- 4. 034838N15 (aplicativo, 0.83) - Alcance de la titularidad docente según la ley N° 20.804
- 5. E34420N20 (aplicativo, 0.8) - Nulidad contratas por inhabilidad extranjera sin excepción
- 6. 084000N16 (aplicativo, 0.78) - Denegación de acumulación de feriado legal por licencia de maternidad
- 7. 054517N13 (contextual, 0.39) - Acreditación individual y asignación de desempeño en Salud
- 8. 078982N10 (contextual, 0.34) - 

### pjo-e156769n21

- Regimen: regimen-e156769n21 - Confianza legítima en contratas: renovación y término anticipado
- Pregunta: ¿Puede la Administración del Estado poner término a la relación laboral de un funcionario contratado bajo la modalidad de contrata sin una fundamentación específica, cuando este ha acumulado años de servicios continuos, invocando la sola expiración del plazo del decreto de nombramiento?
- 1. E540893N24 (rector, 1) - Confianza legítima en renovación de contratas municipales
- 2. E156769N21 (fundante, 0.97) - Confianza legítima en contratas: renovación y término anticipado
- 3. 048251N10 (fundante, 0.74) - 
- 4. 016512N18 (aplicativo, 0.77) - Cómputo de servicios a honorarios para la confianza legítima
- 5. 006400N18 (aplicativo, 0.77) - Actualización de criterios sobre confianza legítima en contratas
- 6. 020445N19 (aplicativo, 0.76) - Confianza legítima en contratas y su terminación por plazo
- 7. 058864N16 (aplicativo, 0.75) - Aplicabilidad del criterio de recontratación a funcionarios a contrata
- 8. E393404N23 (aplicativo, 0.73) - Término contrata por pérdida de confianza en cargo directivo SERNAGEOMIN
- ... 37 candidatos adicionales

### pjo-e173171n22

- Regimen: regimen-e173171n22 - Reinterpretación de contratación a honorarios en Administración Pública
- Pregunta: ¿Puede la Administración del Estado contratar personas bajo la modalidad de honorarios para desempeñar funciones habituales, permanentes y sujetas a subordinación y dependencia, o constituye esto una vulneración de la naturaleza jurídica excepcional de dicho vínculo contractual?
- 1. E531257N24 (rector, 1) - Tiempo a honorarios no válido para liberación de guardia nocturna
- 2. E173171N22 (fundante, 1) - Reinterpretación de contratación a honorarios en Administración Pública
- 3. 028161N87 (fundante, 0.82) - 
- 4. 016512N18 (aplicativo, 0.85) - Cómputo de servicios a honorarios para la confianza legítima
- 5. E330160N23 (aplicativo, 0.84) - Prescindencia política en elección Consejo Constitucional 2023
- 6. E296951N23 (aplicativo, 0.84) - Aclaración efectos dictamen E173171 en traspaso honorarios municipales
- 7. E216667N22 (aplicativo, 0.84) - Rechazo reconsideración dictamen sobre honorarios en Administración Pública
- 8. E331131N23 (aplicativo, 0.83) - Traspaso de honorarios a contrata o Código del Trabajo en municipalidades
- ... 38 candidatos adicionales

### pjo-e516610n24

- Regimen: regimen-e516610n24 - Instructivo sobre Ley Karin en prevención de acoso y violencia laboral
- Pregunta: ¿Cómo deben los órganos de la Administración del Estado implementar los procedimientos de prevención, investigación y sanción del acoso sexual, laboral y la violencia en el trabajo conforme a la Ley 21643, y qué obligaciones específicas recaen sobre las jefaturas para garantizar un entorno laboral seguro durante el periodo de transición normativa?
- 1. D107N26 (rector, 1) - Alcalde no puede suspender preventivamente a director de control por acoso
- 2. E516610N24 (fundante, 1) - Instructivo sobre Ley Karin en prevención de acoso y violencia laboral
- 3. 025961N00 (fundante, 0.82) - 
- 4. E523936N24 (aplicativo, 0.85) - Instrucciones Ley Karin para organismos con personal bajo Código del Trabajo
- 5. E350740N23 (aplicativo, 0.81) - Fuero maternal en contratos a honorarios en SERVEL
- 6. OF29349N26 (aplicativo, 0.78) - Reconsideración sumarios por acoso laboral y responsabilidad alcaldicia
- 7. E111833N25 (aplicativo, 0.76) - Reconsideración Ley Karin: no obligación municipal de participación funcionaria
- 8. E30538N25 (aplicativo, 0.76) - Acoso laboral y sexual: sanciones y perspectiva de género
- ... 3 candidatos adicionales

### pjo-e58945n20

- Regimen: regimen-e58945n20 - Vulneración normativa en permiso de edificación y PRC Las Condes
- Pregunta: ¿Puede la Dirección de Obras Municipales de Las Condes otorgar permisos de edificación que contravengan las disposiciones del Plan Regulador Comunal vigente, invocando normas transitorias o interpretaciones que flexibilicen las exigencias de constructibilidad, densidad o altura establecidas en el instrumento de planificación territorial?
- 1. E338592N23 (rector, 1) - Carácter rural de unidad territorial en PRIVP y requisitos LGUC
- 2. E58945N20 (fundante, 1) - Vulneración normativa en permiso de edificación y PRC Las Condes
- 3. 059456N08 (fundante, 0.82) - 
- 4. 012827N18 (aplicativo, 0.85) - Control de legalidad de normas de Planes Reguladores Comunales
- 5. E98699N21 (aplicativo, 0.84) - Interpretación y límites de normas urbanísticas en PRC de Pucón y Padre Las Casas
- 6. 002745N19 (aplicativo, 0.84) - Alcance de la validez de incentivos en Planes Reguladores
- 7. 040156N17 (aplicativo, 0.83) - Límites constructivos en áreas verdes complementarias PRMS
- 8. E188149N22 (aplicativo, 0.81) - Prevalencia PRMS sobre PRC en Parque Canal El Bollo
- ... 22 candidatos adicionales
