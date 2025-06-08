import { Routes } from '@angular/router';

export const routes: Routes = [
    {'path': '', redirectTo: 'home', pathMatch: 'full' },
    {'path': 'home', pathMatch: 'full', loadComponent: () => import('./app.component').then(m => m.AppComponent) },
];
