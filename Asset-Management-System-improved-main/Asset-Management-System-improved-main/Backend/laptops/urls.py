from django.urls import path
from . import views

urlpatterns = [
    path('dashboard/',                              views.dashboard,       name='dashboard'),
    path('availability/',                           views.availability,    name='availability'),
    path('laptops/',                                views.all_laptops,     name='all_laptops'),
    path('laptops/by-time/',                        views.laptops_by_time, name='laptops_by_time'),
    path('laptops/in-use/',                         views.laptops_in_use,  name='laptops_in_use'),
    path('laptops/add/',                            views.add_laptop,      name='add_laptop'),
    path('laptops/<int:laptop_id>/edit/',           views.edit_laptop,     name='edit_laptop'),
    path('laptops/<int:laptop_id>/status/',         views.update_status,   name='update_status'),
    path('laptops/<int:laptop_id>/delete/',         views.delete_laptop,   name='delete_laptop'),
    path('laptops/<int:laptop_id>/history/',        views.laptop_history,  name='laptop_history'),
    path('assign/',                                 views.assign_laptop,   name='assign_laptop'),
    path('assignments/<int:assignment_id>/return/', views.return_laptop,   name='return_laptop'),
    path('release/',                                views.release_laptops, name='release_laptops'),
    path('users/',                                  views.all_users,       name='all_users'),
    path('users/search/',                           views.search_users,    name='search_users'),
    path('users/add/',                              views.add_user,        name='add_user'),
    path('users/<int:user_id>/edit/',               views.edit_user,       name='edit_user'),
    path('users/<int:user_id>/delete/',             views.delete_user,     name='delete_user'),
    path('users/<int:user_id>/history/',            views.user_history,    name='user_history'),
    path('users/<int:user_id>/return-all/',         views.return_all_user,       name='return_all_user'),
    path('users/<int:user_id>/reassign/',            views.reassign_user_laptop,  name='reassign_user_laptop'),
    path('reports/',                                views.reports,         name='reports'),
]