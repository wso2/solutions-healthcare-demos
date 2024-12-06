import NavBar from "./nav_bar";
import { CDSButton } from "./cds_button";
import { Outlet } from "react-router-dom";
import { useContext } from "react";
import CDSDevPortal from "./cds_dev_portal";
import { ExpandedContext } from "../utils/expanded_context";
import { SCREEN_HEIGHT } from "../constants/page";

export const Layout = () => {
  const { expanded } = useContext(ExpandedContext);
  return (
    <div style={{ height: "100%" }}>
      <NavBar />
      <div style={{ display: "flex", flexDirection: "row" }}>
        <div
          style={{
            width: expanded ? "49vw" : "94.1vw",
            overflowY: "hidden",
            transition: "width 0.5s ease-in-out",
            height: "100%",
          }}
        >
          <Outlet />
        </div>

        <div style={{ width: "1.5vw", marginLeft: "2vw" }}>
          <CDSButton />
        </div>

        <div
          style={{
            width: "0.1vw",
            backgroundColor: "black",
            marginLeft: "1vw",
            marginTop: -SCREEN_HEIGHT * 0.04,
          }}
        />

        <div
          style={{
            alignContent: "center",
            width: expanded ? "45vw" : "0vw",
            height: expanded ? "100%" : "0vh",
            overflowY: "auto",
            transition: "width 0.5s ease-in-out, opacity 0.5s ease-in-out",
            opacity: expanded ? 1 : 0,
          }}
        >
          <CDSDevPortal />
        </div>
      </div>
    </div>
  );
};
