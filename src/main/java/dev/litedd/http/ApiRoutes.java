package dev.litedd.http;

import io.javalin.config.RoutesConfig;

/** Un grupo de rutas de la API que se registra al arrancar el servidor. */
public interface ApiRoutes {

    void register(RoutesConfig routes);
}
