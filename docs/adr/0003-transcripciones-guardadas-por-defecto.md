# ADR-0003: Las transcripciones se guardan por defecto

Estado: aceptada · Fecha: 2026-10-07

## Contexto
Meetily guarda la transcripción de cada Reunión en su base local (SQLite) y en
un `transcripts.json` en la carpeta de grabaciones. El SPEC pedía apagarlo por
defecto como primera tarea después del Build Day. En la primera prueba de punta a
punta (2026-10-07) se decidió lo contrario: la transcripción le sirve al
Usuario para revisar la Reunión, para el panel de Reuniones y para conversar con
el Rol sobre lo que se dijo.

## Decisión
Las transcripciones se guardan, solo en local. El Usuario decide si las borra;
Sottoly no las borra por él. El audio sigue sin guardarse. La Memoria sigue
siendo solo las Decisiones que el Usuario aprueba.

## Alternativas
- Apagadas por defecto, con un interruptor para guardarlas: más privado, pero
  deja vacías la revisión de la Reunión y el panel, y obliga a acordarse de
  encenderlo antes de cada Reunión que se quiera conservar.
- Borrarlas solas después de N días: decide por el Usuario sobre sus datos.

## Consecuencias
- (+) Revisión de la Reunión, panel de Reuniones y chat sobre lo dicho sin
  pasos extra.
- (−) Quedan en el disco conversaciones de la Contraparte: el aviso de
  consentimiento y la Ley 1581 tienen que cubrir que se guarda la
  transcripción, y la App necesita una forma clara de borrarlas.
- (−) `make limpiar` sigue siendo necesario después de cada medición.
