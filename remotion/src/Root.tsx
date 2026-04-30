import { Composition } from "remotion";
import { ProductCard, productCardSchema } from "./compositions/ProductCard";

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="ProductCard"
        component={ProductCard}
        durationInFrames={180}
        fps={30}
        width={1080}
        height={1920}
        schema={productCardSchema}
        defaultProps={{
          sku: "DE201",
          productName: "SCHWARZ",
          tagline: "Чёрная зубная паста с активированным углём",
          benefits: [
            "Отбеливание без абразива",
            "RDA 60 — безопасно для эмали",
            "Свежесть на 12 часов",
          ],
          accentColor: "#0a0a0a",
          highlightColor: "#c8a85a",
        }}
      />
    </>
  );
};
