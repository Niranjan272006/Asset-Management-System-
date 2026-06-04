from django.apps import AppConfig

class LaptopsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'laptops'

    def ready(self):
        # Start scheduler when Django starts
        from laptops.scheduler import start_scheduler
        start_scheduler()