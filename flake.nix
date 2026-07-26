{
  description = "EuroCash — offline-first euro cash counting PWA (SvelteKit, static)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          name = "cash-count";

          # Bun is the only JS runtime / package manager for this project.
          # ImageMagick generates the PWA icon set from the source SVG.
          packages = [
            pkgs.bun
            pkgs.imagemagick
            pkgs.git
          ];

          shellHook = ''
            export BUN_INSTALL_CACHE_DIR="$PWD/.bun-cache"
            echo "cash-count · bun $(bun --version)"
          '';
        };
      });

      formatter = forAllSystems (pkgs: pkgs.nixfmt-rfc-style);
    };
}
