from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.db import transaction
from django.utils import timezone
from django.db.models import Count, Q
from .models import Laptop, Assignment, User
import json
from datetime import date, datetime, time

USER_STATUSES = {value for value, _ in User.STATUS_CHOICES}


def ranges_overlap(sd_a, st_a, ed_a, et_a, sd_b, st_b, ed_b, et_b):
    def to_dt(d_str, t_str):
        t_str = str(t_str)[:5]
        return datetime.strptime(f"{d_str} {t_str}", "%Y-%m-%d %H:%M")
    a_start = to_dt(sd_a, st_a)
    a_end   = to_dt(ed_a, et_a)
    b_start = to_dt(sd_b, st_b)
    b_end   = to_dt(ed_b, et_b)
    return a_start < b_end and a_end > b_start


# ─────────────────────────────────────────────────────────────
# DASHBOARD
# ─────────────────────────────────────────────────────────────
def dashboard(request):
    total       = Laptop.objects.count()
    available   = Laptop.objects.filter(status='available').count()
    in_use      = Laptop.objects.filter(status='in_use').count()
    maintenance = Laptop.objects.filter(status='maintenance').count()
    with_us     = Laptop.objects.filter(status='with_us').count()
    return JsonResponse({
        "total": total, "available": available,
        "in_use": in_use, "maintenance": maintenance, "with_us": with_us,
    })


# ─────────────────────────────────────────────────────────────
# AVAILABILITY — just counts + names, no assign
# GET /api/availability/
# ─────────────────────────────────────────────────────────────
def availability(request):
    available_laptops = Laptop.objects.filter(status='available').order_by('name')
    in_use_laptops    = Laptop.objects.filter(status='in_use').order_by('name')
    maintenance_laptops = Laptop.objects.filter(status='maintenance').order_by('name')
    with_us_laptops   = Laptop.objects.filter(status='with_us').order_by('name')

    def laptop_data(l):
        active = Assignment.objects.filter(laptop=l, status='active').select_related('user').first()
        return {
            "id":          l.id,
            "name":        l.name,
            "model":       l.model,
            "ram_gb":      l.ram_gb,
            "serial":      l.serial_number or "—",
            "location":    l.location or "—",
            "status":      l.status,
            "assigned_to": active.user.name if active and active.user else None,
            "due_back":    str(active.end_date) + " " + str(active.end_time)[:5] if active else None,
        }

    return JsonResponse({
        "available":   [laptop_data(l) for l in available_laptops],
        "in_use":      [laptop_data(l) for l in in_use_laptops],
        "maintenance": [laptop_data(l) for l in maintenance_laptops],
        "with_us":     [laptop_data(l) for l in with_us_laptops],
        "counts": {
            "available":   available_laptops.count(),
            "in_use":      in_use_laptops.count(),
            "maintenance": maintenance_laptops.count(),
            "with_us":     with_us_laptops.count(),
            "total":       Laptop.objects.count(),
        }
    })


# ─────────────────────────────────────────────────────────────
# LAPTOPS BY TIME RANGE (kept for internal use)
# ─────────────────────────────────────────────────────────────
def laptops_by_time(request):
    start_date = request.GET.get('start_date', str(date.today()))
    start_time = request.GET.get('start_time', '00:00')
    end_date   = request.GET.get('end_date',   str(date.today()))
    end_time   = request.GET.get('end_time',   '23:59')
    exclude_user_id = request.GET.get('exclude_user_id')

    try:
        r_start = datetime.strptime(f"{start_date} {start_time[:5]}", "%Y-%m-%d %H:%M")
        r_end   = datetime.strptime(f"{end_date} {end_time[:5]}", "%Y-%m-%d %H:%M")
    except ValueError:
        r_start = datetime.now()
        r_end   = datetime(2099, 12, 31)

    conflicting_ids = set()
    for a in Assignment.objects.filter(status='active').select_related('user'):
        if a.user and a.user.status == 'on_hold':
            continue
        if exclude_user_id and a.user_id and str(a.user_id) == str(exclude_user_id):
            continue
        try:
            a_start = datetime.strptime(f"{a.start_date} {str(a.start_time)[:5]}", "%Y-%m-%d %H:%M")
            a_end   = datetime.strptime(f"{a.end_date} {str(a.end_time)[:5]}", "%Y-%m-%d %H:%M")
        except ValueError:
            continue
        # Overlap: request starts before assignment ends AND request ends after assignment starts
        if r_start < a_end and r_end > a_start:
            conflicting_ids.add(a.laptop_id)

    available_laptops = Laptop.objects.exclude(
        status__in=['maintenance', 'with_us']
    ).exclude(
        id__in=conflicting_ids
    ).order_by('name')

    return JsonResponse({
        "available": [{"id": l.id, "name": l.name, "model": l.model, "ram_gb": l.ram_gb,
                       "serial": l.serial_number or "—", "location": l.location or "—"} for l in available_laptops],
        "total_available": available_laptops.count()
    })


# ─────────────────────────────────────────────────────────────
# LAPTOPS IN USE AT A POINT IN TIME
# ─────────────────────────────────────────────────────────────
def laptops_in_use(request):
    query_date = request.GET.get('date', str(date.today()))
    query_time = request.GET.get('time', datetime.now().strftime('%H:%M'))
    active_assignments = Assignment.objects.filter(status='active').select_related('laptop', 'user')
    in_use_data = []
    for a in active_assignments:
        a_sd = str(a.start_date); a_st = str(a.start_time)[:5]
        a_ed = str(a.end_date);   a_et = str(a.end_time)[:5]
        try:
            a_start = datetime.strptime(f"{a_sd} {a_st}", "%Y-%m-%d %H:%M")
            a_end   = datetime.strptime(f"{a_ed} {a_et}", "%Y-%m-%d %H:%M")
            q_dt    = datetime.strptime(f"{query_date} {query_time[:5]}", "%Y-%m-%d %H:%M")
        except ValueError:
            continue
        if a_start <= q_dt <= a_end:
            in_use_data.append({
                "assignment_id": a.id, "laptop_name": a.laptop.name,
                "laptop_id": a.laptop_id, "model": a.laptop.model, "ram_gb": a.laptop.ram_gb,
                "user": a.user.name if a.user else "Unknown",
                "department": a.user.department if a.user else "—",
                "start_date": a_sd, "start_time": a_st, "end_date": a_ed, "end_time": a_et,
            })
    return JsonResponse({"in_use": in_use_data, "count": len(in_use_data)})


# ─────────────────────────────────────────────────────────────
# ASSIGN LAPTOP
# ─────────────────────────────────────────────────────────────
@csrf_exempt
def assign_laptop(request):
    if request.method != 'POST':
        return JsonResponse({"error": "POST required"}, status=405)

    body       = json.loads(request.body)
    laptop_id  = body.get('laptop_id')
    user_id    = body.get('user_id')
    start_date = body.get('start_date', str(date.today()))
    start_time = body.get('start_time', '09:00')
    end_date   = body.get('end_date',   str(date.today()))
    end_time   = body.get('end_time',   '10:00')

    if not laptop_id:
        return JsonResponse({"success": False, "reason": "laptop_id is required"})

    try:
        with transaction.atomic():
            laptop = Laptop.objects.select_for_update().get(id=laptop_id)
            if laptop.status == 'maintenance':
                return JsonResponse({"success": False, "reason": "Laptop is under maintenance"})

            for a in Assignment.objects.filter(laptop_id=laptop_id, status='active'):
                if ranges_overlap(start_date, start_time, end_date, end_time,
                                  str(a.start_date), str(a.start_time)[:5],
                                  str(a.end_date), str(a.end_time)[:5]):
                    return JsonResponse({"success": False, "reason": f"Laptop already booked from {a.start_date} to {a.end_date}"})

            assignment = Assignment.objects.create(
                laptop_id=laptop_id, user_id=user_id if user_id else None,
                start_date=start_date, start_time=start_time,
                end_date=end_date, end_time=end_time, status='active',
            )
            # Only mark in_use if assignment has already started
            try:
                assign_start_dt = datetime.strptime(f"{start_date} {start_time[:5]}", "%Y-%m-%d %H:%M")
                if assign_start_dt <= datetime.now():
                    laptop.status = 'in_use'
                    laptop.save()
            except ValueError:
                laptop.status = 'in_use'
                laptop.save()
            if user_id:
                User.objects.filter(id=user_id).update(status='in_progress')

            return JsonResponse({"success": True, "assignment_id": assignment.id,
                                 "message": f"{laptop.name} assigned successfully"})
    except Laptop.DoesNotExist:
        return JsonResponse({"success": False, "reason": "Laptop not found"})


# ─────────────────────────────────────────────────────────────
# RETURN LAPTOP
# ─────────────────────────────────────────────────────────────
@csrf_exempt
def reassign_user_laptop(request, user_id):
    if request.method != 'POST':
        return JsonResponse({"error": "POST required"}, status=405)

    body       = json.loads(request.body)
    laptop_id  = body.get('laptop_id')
    start_date = body.get('start_date', str(date.today()))
    start_time = body.get('start_time', '09:00')
    end_date   = body.get('end_date',   str(date.today()))
    end_time   = body.get('end_time',   '10:00')

    if not laptop_id:
        return JsonResponse({"success": False, "reason": "laptop_id is required"})

    try:
        with transaction.atomic():
            user = User.objects.select_for_update().get(id=user_id)
            current = Assignment.objects.select_for_update().filter(user=user, status='active').select_related('laptop').first()
            new_laptop = Laptop.objects.select_for_update().get(id=laptop_id)

            if current and current.laptop_id == int(laptop_id):
                return JsonResponse({"success": False, "reason": "Select a different laptop to reassign"})
            if new_laptop.status in ['maintenance', 'with_us']:
                return JsonResponse({"success": False, "reason": "Selected laptop is not available"})

            for a in Assignment.objects.filter(laptop_id=laptop_id, status='active'):
                if ranges_overlap(start_date, start_time, end_date, end_time,
                                  str(a.start_date), str(a.start_time)[:5],
                                  str(a.end_date), str(a.end_time)[:5]):
                    return JsonResponse({"success": False, "reason": f"Laptop already booked from {a.start_date} to {a.end_date}"})

            if current:
                old_laptop = current.laptop
                current.status = 'completed'
                current.returned_at = timezone.now()
                current.save()
                if not Assignment.objects.filter(laptop_id=old_laptop.id, status='active').exclude(id=current.id).exists():
                    old_laptop.status = 'available'
                    old_laptop.save()

            assignment = Assignment.objects.create(
                laptop_id=laptop_id, user=user,
                start_date=start_date, start_time=start_time,
                end_date=end_date, end_time=end_time, status='active',
            )
            try:
                assign_start_dt = datetime.strptime(f"{start_date} {start_time[:5]}", "%Y-%m-%d %H:%M")
                if assign_start_dt <= datetime.now():
                    new_laptop.status = 'in_use'
                    new_laptop.save()
            except ValueError:
                new_laptop.status = 'in_use'
                new_laptop.save()
            user.status = 'in_progress'
            user.save()

            return JsonResponse({"success": True, "assignment_id": assignment.id,
                                 "message": f"{user.name} reassigned to {new_laptop.name}"})
    except User.DoesNotExist:
        return JsonResponse({"success": False, "reason": "User not found"})
    except Laptop.DoesNotExist:
        return JsonResponse({"success": False, "reason": "Laptop not found"})


@csrf_exempt
def return_laptop(request, assignment_id):
    if request.method != 'POST':
        return JsonResponse({"error": "POST required"}, status=405)
    try:
        with transaction.atomic():
            assignment = Assignment.objects.select_for_update().get(id=assignment_id, status='active')
            laptop = assignment.laptop
            assignment.status = 'completed'
            assignment.returned_at = timezone.now()
            assignment.save()
            other_active = Assignment.objects.filter(laptop_id=laptop.id, status='active').exclude(id=assignment_id).exists()
            if not other_active:
                laptop.status = 'available'
                laptop.save()
            if assignment.user_id and not Assignment.objects.filter(user_id=assignment.user_id, status='active').exclude(id=assignment_id).exists():
                User.objects.filter(id=assignment.user_id).update(status='yet_to_join')
            return JsonResponse({"success": True, "message": f"{laptop.name} returned successfully"})
    except Assignment.DoesNotExist:
        return JsonResponse({"success": False, "reason": "Assignment not found or already returned"})


# ─────────────────────────────────────────────────────────────
# RELEASE OVERDUE LAPTOPS
# ─────────────────────────────────────────────────────────────
@csrf_exempt
def release_laptops(request):
    now_dt = timezone.localtime()
    released_count = 0
    released_laptops = []
    for a in Assignment.objects.filter(status='active').select_related('laptop'):
        try:
            a_end = datetime.strptime(f"{a.end_date} {str(a.end_time)[:5]}", "%Y-%m-%d %H:%M")
        except ValueError:
            continue
        if now_dt.replace(tzinfo=None) > a_end:
            a.status = 'completed'; a.returned_at = timezone.now(); a.save()
            if a.user_id and not Assignment.objects.filter(user_id=a.user_id, status='active').exclude(id=a.id).exists():
                User.objects.filter(id=a.user_id).update(status='yet_to_join')
            released_laptops.append(a.laptop_id); released_count += 1
    for lid in set(released_laptops):
        if not Assignment.objects.filter(laptop_id=lid, status='active').exists():
            Laptop.objects.filter(id=lid).update(status='available')
    return JsonResponse({"success": True, "released": released_count})


# ─────────────────────────────────────────────────────────────
# ALL LAPTOPS
# ─────────────────────────────────────────────────────────────
def all_laptops(request):
    laptops = Laptop.objects.all().order_by('name')
    data = []
    for l in laptops:
        active = Assignment.objects.filter(laptop=l, status='active').select_related('user').first()
        data.append({
            "id": l.id, "name": l.name, "model": l.model, "ram_gb": l.ram_gb,
            "serial_number": l.serial_number or "", "location": l.location or "",
            "status": l.status,
            "assignment_id": active.id if active else None,
            "assigned_to": active.user.name if active and active.user else None,
        })
    return JsonResponse({"laptops": data})


# ─────────────────────────────────────────────────────────────
# ADD LAPTOP
# ─────────────────────────────────────────────────────────────
@csrf_exempt
def add_laptop(request):
    if request.method != 'POST':
        return JsonResponse({"error": "POST required"}, status=405)
    body = json.loads(request.body)
    name = body.get('name', '').strip(); model = body.get('model', '').strip()
    ram_gb = body.get('ram_gb'); serial_number = body.get('serial_number', '').strip()
    location = body.get('location', '').strip()
    if not name or not model or not ram_gb:
        return JsonResponse({"success": False, "reason": "Name, model and RAM are required"})
    if Laptop.objects.filter(name=name).exists():
        return JsonResponse({"success": False, "reason": "Laptop name already exists"})
    laptop = Laptop.objects.create(name=name, model=model, ram_gb=int(ram_gb),
                                   serial_number=serial_number or None, location=location or None, status='available')
    return JsonResponse({"success": True, "message": f"{laptop.name} added successfully",
                         "laptop": {"id": laptop.id, "name": laptop.name, "model": laptop.model,
                                    "ram_gb": laptop.ram_gb, "serial_number": laptop.serial_number or "",
                                    "location": laptop.location or "", "status": laptop.status}})


# ─────────────────────────────────────────────────────────────
# EDIT LAPTOP
# ─────────────────────────────────────────────────────────────
@csrf_exempt
def edit_laptop(request, laptop_id):
    if request.method != 'PUT':
        return JsonResponse({"error": "PUT required"}, status=405)
    try:
        laptop = Laptop.objects.get(id=laptop_id)
    except Laptop.DoesNotExist:
        return JsonResponse({"success": False, "reason": "Laptop not found"})
    body = json.loads(request.body)
    laptop.name = body.get('name', laptop.name); laptop.model = body.get('model', laptop.model)
    laptop.ram_gb = body.get('ram_gb', laptop.ram_gb); laptop.serial_number = body.get('serial_number', laptop.serial_number)
    laptop.location = body.get('location', laptop.location); laptop.save()
    return JsonResponse({"success": True, "message": f"{laptop.name} updated successfully"})


# ─────────────────────────────────────────────────────────────
# UPDATE STATUS
# ─────────────────────────────────────────────────────────────
@csrf_exempt
def update_status(request, laptop_id):
    if request.method != 'PATCH':
        return JsonResponse({"error": "PATCH required"}, status=405)
    try:
        laptop = Laptop.objects.get(id=laptop_id)
    except Laptop.DoesNotExist:
        return JsonResponse({"success": False, "reason": "Laptop not found"})
    body = json.loads(request.body)
    status = body.get('status')
    if status not in ['available', 'in_use', 'maintenance', 'with_us']:
        return JsonResponse({"success": False, "reason": "Invalid status"})
    if laptop.status == 'in_use' and status in ['maintenance', 'with_us']:
        if Assignment.objects.filter(laptop_id=laptop_id, status='active').exists():
            return JsonResponse({"success": False, "reason": "Laptop is currently assigned. Return it first."})
    laptop.status = status; laptop.save()
    return JsonResponse({"success": True, "message": f"{laptop.name} status updated to {status}"})


# ─────────────────────────────────────────────────────────────
# DELETE LAPTOP
# ─────────────────────────────────────────────────────────────
@csrf_exempt
def delete_laptop(request, laptop_id):
    if request.method != 'DELETE':
        return JsonResponse({"error": "DELETE required"}, status=405)
    try:
        laptop = Laptop.objects.get(id=laptop_id)
    except Laptop.DoesNotExist:
        return JsonResponse({"success": False, "reason": "Laptop not found"})
    if laptop.status == 'in_use':
        return JsonResponse({"success": False, "reason": "Laptop is currently in use. Return it first."})
    name = laptop.name; laptop.delete()
    return JsonResponse({"success": True, "message": f"{name} deleted successfully"})


# ─────────────────────────────────────────────────────────────
# ALL USERS
# ─────────────────────────────────────────────────────────────
def all_users(request):
    users = User.objects.all().order_by('name')
    data = []
    for u in users:
        active = Assignment.objects.filter(user=u, status='active').select_related('laptop').first()
        has_history = Assignment.objects.filter(user=u).exists()
        data.append({
            "id": u.id, "name": u.name, "user_id": u.user_id or "",
            "phone": u.phone or "", "email": u.email, "department": u.department,
            "status": u.status,
            "current_laptop": active.laptop.name if active else None,
            "current_assignment_id": active.id if active else None,
            "has_history": has_history,
            "start_date": str(u.start_date) if u.start_date else None,
            "start_time": str(u.start_time)[:5] if u.start_time else None,
            "end_date": str(u.end_date) if u.end_date else None,
            "end_time": str(u.end_time)[:5] if u.end_time else None,
            "preset_start_date": str(u.start_date) if u.start_date else None,
            "preset_start_time": str(u.start_time)[:5] if u.start_time else None,
            "preset_end_date": str(u.end_date) if u.end_date else None,
            "preset_end_time": str(u.end_time)[:5] if u.end_time else None,
        })
    return JsonResponse({"users": data})


# ─────────────────────────────────────────────────────────────
# SEARCH USERS
# ─────────────────────────────────────────────────────────────
def search_users(request):
    q = request.GET.get('q', '').strip()
    if len(q) < 2:
        return JsonResponse({"users": []})
    users = User.objects.filter(
        Q(name__icontains=q) | Q(department__icontains=q) | Q(email__icontains=q) | Q(user_id__icontains=q)
    ).order_by('name')[:10]
    return JsonResponse({"users": [{"id": u.id, "name": u.name, "user_id": u.user_id or "",
                                    "email": u.email, "department": u.department} for u in users]})


# ─────────────────────────────────────────────────────────────
# ADD USER
# ─────────────────────────────────────────────────────────────
@csrf_exempt
def add_user(request):
    if request.method != 'POST':
        return JsonResponse({"error": "POST required"}, status=405)
    body = json.loads(request.body)
    name = body.get('name', '').strip(); email = body.get('email', '').strip()
    department = body.get('department', '').strip()
    user_id = body.get('user_id', '').strip(); phone = body.get('phone', '').strip()
    start_date = body.get('start_date') or None
    start_time = body.get('start_time') or None
    end_date   = body.get('end_date') or None
    end_time   = body.get('end_time') or None
    status     = body.get('status') or 'yet_to_join'
    if not name or not email or not department:
        return JsonResponse({"success": False, "reason": "Name, email and department are required"})
    if not user_id:
        return JsonResponse({"success": False, "reason": "Employee ID is required"})
    if status not in USER_STATUSES:
        return JsonResponse({"success": False, "reason": "Invalid user status"})
    if User.objects.filter(email=email).exists():
        return JsonResponse({"success": False, "reason": "Email already exists"})
    if user_id and User.objects.filter(user_id=user_id).exists():
        return JsonResponse({"success": False, "reason": "User ID already exists"})
    user = User.objects.create(name=name, email=email, department=department,
                               user_id=user_id or None, phone=phone or None,
                               status=status,
                               start_date=start_date, start_time=start_time,
                               end_date=end_date, end_time=end_time)
    return JsonResponse({"success": True, "message": f"{user.name} added successfully",
                         "user": {"id": user.id, "name": user.name, "email": user.email,
                                  "department": user.department, "user_id": user.user_id or "", "phone": user.phone or "",
                                  "status": user.status}})


# ─────────────────────────────────────────────────────────────
# EDIT USER
# ─────────────────────────────────────────────────────────────
@csrf_exempt
def edit_user(request, user_id):
    if request.method != 'PUT':
        return JsonResponse({"error": "PUT required"}, status=405)
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return JsonResponse({"success": False, "reason": "User not found"})
    body = json.loads(request.body)
    user.name = body.get('name', user.name); user.email = body.get('email', user.email)
    user.department = body.get('department', user.department)
    user.user_id = body.get('user_id', user.user_id); user.phone = body.get('phone', user.phone)
    if 'status' in body:
        new_status = body.get('status')
        if new_status not in USER_STATUSES:
            return JsonResponse({"success": False, "reason": "Invalid user status"})
        old_status = user.status
        user.status = new_status
        # When set to on_hold, free up their laptop
        if new_status == 'on_hold' and old_status != 'on_hold':
            active = Assignment.objects.filter(user=user, status='active').select_related('laptop').first()
            if active:
                active.laptop.status = 'available'
                active.laptop.save()
        # When coming back from on_hold with an active assignment, mark laptop in_use again
        elif old_status == 'on_hold' and new_status not in ('on_hold', 'completed', 'discontinued'):
            active = Assignment.objects.filter(user=user, status='active').select_related('laptop').first()
            if active:
                active.laptop.status = 'in_use'
                active.laptop.save()
    if 'start_date' in body: user.start_date = body.get('start_date') or None
    if 'start_time' in body: user.start_time = body.get('start_time') or None
    if 'end_date'   in body: user.end_date   = body.get('end_date')   or None
    if 'end_time'   in body: user.end_time   = body.get('end_time')   or None
    user.save()
    return JsonResponse({"success": True, "message": f"{user.name} updated successfully"})


# ─────────────────────────────────────────────────────────────
# RETURN ALL USER ASSIGNMENTS
# POST /api/users/<id>/return-all/
# ─────────────────────────────────────────────────────────────
@csrf_exempt
def return_all_user(request, user_id):
    if request.method != 'POST':
        return JsonResponse({"error": "POST required"}, status=405)
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return JsonResponse({"success": False, "reason": "User not found"})
    active = Assignment.objects.filter(user=user, status='active').select_related('laptop')
    count = 0
    for a in active:
        a.status = 'completed'; a.returned_at = timezone.now(); a.save()
        if not Assignment.objects.filter(laptop_id=a.laptop_id, status='active').exclude(id=a.id).exists():
            a.laptop.status = 'available'; a.laptop.save()
        count += 1
    user.status = 'yet_to_join'
    user.save()
    return JsonResponse({"success": True, "message": f"Returned {count} laptop(s) from {user.name}"})


# ─────────────────────────────────────────────────────────────
# USER HISTORY
# GET /api/users/<id>/history/
# ─────────────────────────────────────────────────────────────
def user_history(request, user_id):
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return JsonResponse({"success": False, "reason": "User not found"})
    assignments = Assignment.objects.filter(user=user).select_related('laptop').order_by('-assigned_at')
    history = [{
        "id": a.id,
        "laptop": a.laptop.name,
        "model": a.laptop.model,
        "start_date": str(a.start_date), "start_time": str(a.start_time)[:5],
        "end_date": str(a.end_date),   "end_time": str(a.end_time)[:5],
        "status": a.status,
        "returned_at": a.returned_at.strftime("%d %b %Y %H:%M") if a.returned_at else "—",
    } for a in assignments]
    return JsonResponse({"user": user.name, "department": user.department, "history": history, "total": len(history)})


# ─────────────────────────────────────────────────────────────
# DELETE USER
# ─────────────────────────────────────────────────────────────
@csrf_exempt
def delete_user(request, user_id):
    if request.method != 'DELETE':
        return JsonResponse({"error": "DELETE required"}, status=405)
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return JsonResponse({"success": False, "reason": "User not found"})
    if Assignment.objects.filter(user_id=user_id, status='active').exists():
        return JsonResponse({"success": False, "reason": "User has an active assignment. Return it first."})
    name = user.name; user.delete()
    return JsonResponse({"success": True, "message": f"{name} deleted successfully"})


# ─────────────────────────────────────────────────────────────
# LAPTOP HISTORY (for Reports — filter by laptop)
# GET /api/laptops/<id>/history/
# ─────────────────────────────────────────────────────────────
def laptop_history(request, laptop_id):
    try:
        laptop = Laptop.objects.get(id=laptop_id)
    except Laptop.DoesNotExist:
        return JsonResponse({"success": False, "reason": "Laptop not found"})

    assignments = Assignment.objects.filter(laptop=laptop).select_related('user').order_by('-assigned_at')
    history = []
    for a in assignments:
        history.append({
            "id": a.id, "user": a.user.name if a.user else "Unknown",
            "department": a.user.department if a.user else "—",
            "user_id": a.user.user_id if a.user and a.user.user_id else "—",
            "start_date": str(a.start_date), "start_time": str(a.start_time)[:5],
            "end_date": str(a.end_date), "end_time": str(a.end_time)[:5],
            "status": a.status,
            "assigned_at": a.assigned_at.strftime("%d %b %Y %H:%M"),
            "returned_at": a.returned_at.strftime("%d %b %Y %H:%M") if a.returned_at else "—",
        })
    return JsonResponse({"laptop": laptop.name, "model": laptop.model, "history": history, "total": len(history)})


# ─────────────────────────────────────────────────────────────
# REPORTS
# ─────────────────────────────────────────────────────────────
def reports(request):
    history = Assignment.objects.select_related('laptop', 'user').order_by('-assigned_at')[:50]
    history_data = [{
        "id": a.id, "laptop": a.laptop.name, "model": a.laptop.model,
        "user": a.user.name if a.user else "Unknown",
        "department": a.user.department if a.user else "—",
        "start_date": str(a.start_date), "start_time": str(a.start_time)[:5],
        "end_date": str(a.end_date), "end_time": str(a.end_time)[:5],
        "status": a.status,
        "assigned_at": a.assigned_at.strftime("%d %b %Y %H:%M"),
        "returned_at": a.returned_at.strftime("%d %b %Y %H:%M") if a.returned_at else "—",
    } for a in history]

    top_laptops = Assignment.objects.values('laptop__name', 'laptop__model').annotate(count=Count('id')).order_by('-count')[:10]
    by_user     = Assignment.objects.filter(user__isnull=False).values('user__name', 'user__department').annotate(count=Count('id')).order_by('-count')[:10]
    all_laptops = Laptop.objects.all().order_by('name')
    laptops_list = [{"id": l.id, "name": l.name, "model": l.model} for l in all_laptops]

    return JsonResponse({
        "history": history_data, "top_laptops": list(top_laptops), "by_user": list(by_user),
        "laptops_list": laptops_list,
        "total_assignments": Assignment.objects.count(),
        "active_now": Assignment.objects.filter(status='active').count(),
        "completed": Assignment.objects.filter(status='completed').count(),
    })
