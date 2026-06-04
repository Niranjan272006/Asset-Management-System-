from django.db import models


class Laptop(models.Model):
    STATUS_CHOICES = [
        ('available',   'Available'),
        ('in_use',      'In Use'),
        ('maintenance', 'Maintenance'),
        ('with_us',     'With Us'),
    ]

    name          = models.CharField(max_length=50)
    model         = models.CharField(max_length=100)
    ram_gb        = models.IntegerField()
    serial_number = models.CharField(max_length=100, null=True, blank=True)
    location      = models.CharField(max_length=100, null=True, blank=True)
    status        = models.CharField(max_length=20, choices=STATUS_CHOICES, default='available')

    def __str__(self):
        return self.name


class User(models.Model):
    STATUS_CHOICES = [
        ('yet_to_join', 'Yet to Join'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('not_joined', 'Not Joined'),
        ('discontinued', 'Discontinued'),
        ('on_hold', 'On Hold'),
    ]

    name       = models.CharField(max_length=100)
    user_id    = models.CharField(max_length=50, unique=True, null=True, blank=True)
    phone      = models.CharField(max_length=20, null=True, blank=True)
    email      = models.EmailField(unique=True)
    department = models.CharField(max_length=100)
    status     = models.CharField(max_length=20, choices=STATUS_CHOICES, default='yet_to_join')
    start_date = models.DateField(null=True, blank=True)
    start_time = models.TimeField(null=True, blank=True)
    end_date   = models.DateField(null=True, blank=True)
    end_time   = models.TimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Assignment(models.Model):
    STATUS_CHOICES = [
        ('active',    'Active'),
        ('completed', 'Completed'),
    ]

    laptop      = models.ForeignKey(Laptop, on_delete=models.CASCADE)
    user        = models.ForeignKey(User,   on_delete=models.SET_NULL, null=True, blank=True)
    start_date  = models.DateField()
    start_time  = models.TimeField()
    end_date    = models.DateField()
    end_time    = models.TimeField()
    status      = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    assigned_at = models.DateTimeField(auto_now_add=True)
    returned_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.laptop.name} → {self.user.name if self.user else 'Unknown'} ({self.start_date})"
