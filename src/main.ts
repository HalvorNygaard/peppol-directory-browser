import "zone.js"; // Included for Angular change detection
import { bootstrapApplication } from "@angular/platform-browser";
import { AppComponent } from "./app.component";
import { provideRouter } from "@angular/router";
import { importProvidersFrom } from "@angular/core";
import { HttpClientModule } from "@angular/common/http";
import { DirectoryPageComponent } from "./directory-page.component";

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter([
      { path: "", redirectTo: "directory", pathMatch: "full" },
      { path: "directory", component: DirectoryPageComponent },
      { path: "directory/:id", component: DirectoryPageComponent },
      { path: "**", redirectTo: "directory" },
    ]),
    importProvidersFrom(HttpClientModule),
  ],
}).catch((err: any) => console.error(err));
