from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean, Enum
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime
import enum

Base = declarative_base()

class PersonType(enum.Enum):
    RESIDENT = "RESIDENT"
    DOMESTIC_HELP = "DOMESTIC_HELP"
    DRIVER = "DRIVER"
    SECURITY = "SECURITY"
    DELIVERY = "DELIVERY"
    GUEST = "GUEST"
    CONTRACTOR = "CONTRACTOR"
    ADMIN = "ADMIN"

class PersonStatus(enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    REVOKED = "REVOKED"

class Person(Base):
    __tablename__ = "person"
    
    person_id = Column(String, primary_key=True, index=True) # e.g., HH_0234
    name = Column(String, nullable=False)
    person_type = Column(Enum(PersonType), nullable=False)
    phone = Column(String, nullable=True)
    status = Column(Enum(PersonStatus), default=PersonStatus.ACTIVE)
    biometric_template_id = Column(String, nullable=True) # Reference to encrypted storage
    
    residences = relationship("PersonResidence", back_populates="person")
    policies = relationship("AccessPolicy", back_populates="person")
    events = relationship("BiometricEvent", back_populates="person")

class Residence(Base):
    __tablename__ = "residence"
    
    residence_id = Column(String, primary_key=True) # e.g., A-1204
    tower = Column(String, nullable=False) # e.g., Tower A
    flat_number = Column(String, nullable=False) # e.g., 1204
    
    persons = relationship("PersonResidence", back_populates="residence")

class PersonResidence(Base):
    __tablename__ = "person_residence"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    person_id = Column(String, ForeignKey("person.person_id"))
    residence_id = Column(String, ForeignKey("residence.residence_id"))
    relationship_type = Column(String) # e.g., "employer", "resident"
    valid_from = Column(DateTime, default=datetime.utcnow)
    valid_until = Column(DateTime, nullable=True)
    
    person = relationship("Person", back_populates="residences")
    residence = relationship("Residence", back_populates="persons")

class AccessPolicy(Base):
    __tablename__ = "access_policy"
    
    policy_id = Column(Integer, primary_key=True, autoincrement=True)
    person_id = Column(String, ForeignKey("person.person_id"))
    zone_id = Column(String, ForeignKey("zone.zone_id"))
    days = Column(String) # e.g., "Mon,Tue,Wed,Thu,Fri,Sat"
    start_time = Column(String) # e.g., "08:00"
    end_time = Column(String) # e.g., "18:00"
    requires_approval = Column(Boolean, default=False) # E.g., true for domestic help requiring Dwaar approval
    
    person = relationship("Person", back_populates="policies")
    zone = relationship("Zone", back_populates="policies")

class Zone(Base):
    __tablename__ = "zone"
    
    zone_id = Column(String, primary_key=True) # e.g., MAIN_GATE, TOWER_A_LIFT, CLUBHOUSE
    tower = Column(String, nullable=True)
    floor = Column(String, nullable=True)
    facility = Column(String, nullable=True)
    terminal_id = Column(String, nullable=False, unique=True)
    
    policies = relationship("AccessPolicy", back_populates="zone")
    events = relationship("BiometricEvent", back_populates="zone")

class BiometricEvent(Base):
    __tablename__ = "biometric_event"
    
    event_id = Column(String, primary_key=True)
    person_id = Column(String, ForeignKey("person.person_id"))
    terminal_id = Column(String, ForeignKey("zone.terminal_id"))
    timestamp = Column(DateTime, default=datetime.utcnow)
    event_type = Column(String) # e.g., "ENTRY", "EXIT", "FAILED_ATTEMPT"
    match_score = Column(Float, nullable=True)
    quality_score = Column(Float, nullable=True)
    liveness_score = Column(Float, nullable=True)
    
    person = relationship("Person", back_populates="events")
    zone = relationship("Zone", back_populates="events", foreign_keys=[terminal_id])
    decision = relationship("AccessDecision", back_populates="event", uselist=False)

class AccessDecision(Base):
    __tablename__ = "access_decision"
    
    event_id = Column(String, ForeignKey("biometric_event.event_id"), primary_key=True)
    decision = Column(String) # "ALLOW", "DENY"
    reason = Column(String) # e.g., "IdentityValid AND FacilityPermitted"
    approved_by = Column(String, nullable=True) # e.g., "Resident of A-1204 via Dwaar AI"
    timestamp = Column(DateTime, default=datetime.utcnow)
    
    event = relationship("BiometricEvent", back_populates="decision")

class MovementEvent(Base):
    __tablename__ = "movement_event"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    person_id = Column(String, ForeignKey("person.person_id"))
    source_zone = Column(String, nullable=True)
    destination_zone = Column(String, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    route_id = Column(String, nullable=True) # to group sequential movements

class Anomaly(Base):
    __tablename__ = "anomaly"
    
    anomaly_id = Column(String, primary_key=True)
    person_id = Column(String, ForeignKey("person.person_id"))
    event_id = Column(String, ForeignKey("biometric_event.event_id"), nullable=True)
    risk_score = Column(Float) # 0.0 to 1.0
    reason = Column(String) # e.g., "Route deviation: Gate -> Tower B (Expected Tower A)"
    status = Column(String, default="PENDING_REVIEW") # PENDING_REVIEW, RESOLVED, FALSE_ALARM
    reviewed_by = Column(String, nullable=True)
