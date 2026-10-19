import { WholesaleBrand } from "@prisma/client";

/**
 * As marcas da casa, como se escrevem na tela.
 *
 * O enum `WholesaleBrand` é reusado em vez de um enum novo com os mesmos dois
 * valores: ele nasceu nas candidaturas de atacado, mas descreve a MARCA do
 * negócio, não o canal. Dois enums com OKEY e LOV_CLUB divergiriam no dia em
 * que uma terceira marca entrasse por um só dos lados.
 *
 * O rótulo mora aqui, e não solto em cada tela, porque `LOV_CLUB` nunca deve
 * aparecer assim para ninguém — e já apareceria em três lugares diferentes.
 */
export const SELECT_BRAND_LABEL: Record<WholesaleBrand, string> = {
  OKEY: "OKEY",
  LOV_CLUB: "LOV CLUB",
};

/** As marcas na ordem em que aparecem nos seletores. */
export const SELECT_BRANDS = Object.values(WholesaleBrand);
