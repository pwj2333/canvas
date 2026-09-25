import type { ThemeConfig } from "antd";
import { theme as antdTheme } from "antd";

const neutral = {
    light: {
        primary: "#e96b18",
        primaryHover: "#c9550d",
        primaryText: "#fffaf0",
        elevatedBg: "#fffdf8",
        itemHoverBg: "rgba(233, 107, 24, 0.08)",
        itemSelectedBg: "rgba(233, 107, 24, 0.14)",
        itemSelectedHoverBg: "rgba(233, 107, 24, 0.2)",
        itemText: "#181818",
        tableSelectedBg: "rgba(233, 107, 24, 0.08)",
        tableSelectedHoverBg: "rgba(233, 107, 24, 0.12)",
    },
    dark: {
        primary: "#f29a4a",
        primaryHover: "#ffb36e",
        primaryText: "#24170e",
        elevatedBg: "#2a2017",
        itemHoverBg: "rgba(242, 154, 74, 0.12)",
        itemSelectedBg: "rgba(242, 154, 74, 0.18)",
        itemSelectedHoverBg: "rgba(242, 154, 74, 0.24)",
        itemText: "#fff8ed",
        tableSelectedBg: "rgba(242, 154, 74, 0.12)",
        tableSelectedHoverBg: "rgba(242, 154, 74, 0.18)",
    },
};

export function getAntThemeConfig(dark: boolean): ThemeConfig {
    const color = dark ? neutral.dark : neutral.light;

    return {
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        cssVar: { key: dark ? "infinite-canvas-dark" : "infinite-canvas-light" },
        token: {
            colorPrimary: color.primary,
            colorInfo: color.primary,
            colorLink: color.primary,
            colorLinkHover: color.primaryHover,
            colorLinkActive: color.primary,
            colorTextLightSolid: color.primaryText,
            colorBgElevated: color.elevatedBg,
            controlItemBgHover: color.itemHoverBg,
            controlItemBgActive: color.itemSelectedBg,
            controlItemBgActiveHover: color.itemSelectedHoverBg,
        },
        components: {
            Button: {
                primaryShadow: "none",
            },
            Dropdown: {
                colorBgElevated: color.elevatedBg,
                colorText: color.itemText,
                controlItemBgHover: color.itemHoverBg,
                controlItemBgActive: color.itemSelectedBg,
                controlItemBgActiveHover: color.itemSelectedHoverBg,
            },
            Menu: {
                popupBg: color.elevatedBg,
                itemActiveBg: color.itemSelectedBg,
                itemHoverBg: color.itemHoverBg,
                itemSelectedBg: color.itemSelectedBg,
                itemSelectedColor: color.itemText,
                darkPopupBg: neutral.dark.elevatedBg,
                darkItemHoverBg: neutral.dark.itemHoverBg,
                darkItemSelectedBg: neutral.dark.itemSelectedBg,
                darkItemSelectedColor: neutral.dark.itemText,
            },
            Select: {
                optionActiveBg: color.itemHoverBg,
                optionSelectedBg: color.itemSelectedBg,
                optionSelectedColor: color.itemText,
            },
            Table: {
                rowSelectedBg: color.tableSelectedBg,
                rowSelectedHoverBg: color.tableSelectedHoverBg,
            },
        },
    };
}
