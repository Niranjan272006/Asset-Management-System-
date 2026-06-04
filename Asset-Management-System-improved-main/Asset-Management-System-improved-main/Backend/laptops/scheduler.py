from apscheduler.schedulers.background import BackgroundScheduler
from django.utils import timezone
from datetime import date
import logging

logger = logging.getLogger(__name__)

def release_expired_laptops():
    from laptops.models import Laptop, Assignment

    now   = timezone.localtime().time()
    today = date.today()

    print(f"[Auto Release] Running at {now}")

    expired = Assignment.objects.filter(
        status       = 'active',
        date         = today,
        end_time__lte = now
    )

    count      = expired.count()
    laptop_ids = list(expired.values_list('laptop_id', flat=True))

    expired.update(status='completed', returned_at=timezone.now())

    for lid in laptop_ids:
        still_active = Assignment.objects.filter(
            laptop_id = lid,
            status    = 'active'
        ).exists()
        if not still_active:
            Laptop.objects.filter(id=lid).update(status='available')

    if count > 0:
        print(f"[Auto Release] Released {count} laptops")

def start_scheduler():
    scheduler = BackgroundScheduler()
    scheduler.add_job(
        release_expired_laptops,
        'interval',
        minutes = 1,
        id      = 'auto_release',
        replace_existing = True
    )
    scheduler.start()
    print("[Scheduler] Auto release job started — runs every minute")