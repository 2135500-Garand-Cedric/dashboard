"use client";

import Link from "next/link";
import { useState } from "react";
import { HomeIcon, DocumentTextIcon, FolderIcon, XMarkIcon, Bars3Icon } from "@heroicons/react/24/solid";

export default function SideMenu() {
  const [isOpen, setIsOpen] = useState(false);

  const menuItems = [
    { name: "Main Dashboard", href: "/", icon: HomeIcon },
    { name: "Todos", href: "/todos", icon: DocumentTextIcon },
    { name: "Calendar", href: "/events", icon: FolderIcon },
  ];

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-20 md:hidden"
          style={{ backgroundColor: "rgba(0,0,0,0.3)" }}
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed top-0 left-0 w-64 z-30 transform transition-transform duration-300
          ${isOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0 md:static md:shadow-none flex flex-col h-screen justify-between`}
        style={{
          backgroundColor: "var(--color-card-bg)",
          borderRight: "1px solid var(--color-card-border)",
        }}
      >
        <div>
          <div
            className="flex items-center justify-between p-4 border-b"
            style={{ borderColor: "var(--color-card-border)" }}
          >
            <h1
              className="text-lg font-bold"
              style={{ color: "var(--color-foreground)" }}
            >
              Dashboard Menu
            </h1>
            <button
              className="md:hidden"
              style={{ color: "var(--color-foreground)" }}
              onClick={() => setIsOpen(false)}
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>

          <nav className="p-4 space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className="flex items-center p-2 rounded transition space-x-2"
                  style={{ color: "var(--color-foreground)" }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.backgroundColor = "var(--accent)/10")
                  }
                  onMouseOut={(e) =>
                    (e.currentTarget.style.backgroundColor = "transparent")
                  }
                  onClick={() => setIsOpen(false)}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Mobile hamburger button */}
      {!isOpen && (
        <button
          className="fixed top-4 left-4 z-40 p-2 rounded shadow md:hidden"
          style={{
            backgroundColor: "var(--color-card-bg)",
            color: "var(--color-foreground)",
            border: "1px solid var(--color-card-border)",
          }}
          onClick={() => setIsOpen(true)}
        >
          <Bars3Icon className="w-6 h-6" />
        </button>
      )}
    </>
  );
}
