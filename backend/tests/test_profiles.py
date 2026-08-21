import pytest

from app.profiles import load_profile


def test_both_profiles_load():
    for name in ["rural_100", "urban_500"]:
        p = load_profile(name)
        assert p.profile_name == name


def test_max_wait_covers_esi_2_to_5():
    p = load_profile("urban_500")
    assert set(p.max_wait_min) == {2, 3, 4, 5}
    # tighter limits at higher acuity
    assert p.max_wait_min[2] < p.max_wait_min[3] < p.max_wait_min[4] < p.max_wait_min[5]


def test_profiles_actually_differ():
    rural, urban = load_profile("rural_100"), load_profile("urban_500")
    assert rural.max_wait_min[4] != urban.max_wait_min[4]
    assert rural.surge_queue_threshold != urban.surge_queue_threshold
    assert rural.reassess_check_interval_min != urban.reassess_check_interval_min


def test_unknown_profile_raises():
    with pytest.raises(FileNotFoundError):
        load_profile("mars_colony_9000")
