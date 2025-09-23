import 'zone.js'; // Included for Angular change detection
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app.component';
import { provideRouter } from '@angular/router';
import { importProvidersFrom } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter([
      { path: '', redirectTo: 'directory', pathMatch: 'full' },
      { path: 'directory', component: AppComponent },
      { path: 'directory/:id', component: AppComponent },
      // Redirect any unmatched paths to /directory so the SPA has a single canonical base
      { path: '**', redirectTo: 'directory' }
    ]),
    importProvidersFrom(HttpClientModule)
  ]
}).catch((err: any) => console.error(err));