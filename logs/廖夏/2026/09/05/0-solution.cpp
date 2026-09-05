#include<iostream>
#include<algorithm>
using namespace std;
const int MAXN = 2e5 + 5;
typedef long long ll;
ll a[MAXN]; 
ll res, n, k;
ll find_lower(ll x){
	int l = 1, r = n + 1;
	ll cnt = 0;
	while (l < r){
		int mid = l + (r - l) / 2;
		if (a[mid] >= x) r = mid;
		else l = mid + 1;	
	}
	return l;
} 
ll find_upper(int x){
	int l = 1, r = n + 1;
	while (l < r){
		int mid = l + (r - l) / 2;
		if (a[mid] <= x) l = mid + 1;
		else r = mid;
	}
	return l;
}
ll find(int x){
	return find_upper(x) - find_lower(x);
}
int main(){
	long long C;
	cin >> n >> C; 
	for (int i = 1; i <= n; i++) cin >> a[i]; 
	sort(a + 1, a + n + 1);
	for (int i = n; i >= 1; i--){
		ll x = a[i] - C;
		if (x >= a[1]) res += find(x);
		else break; 
		// cout << res << " ";
	}
	cout << res;
	return 0;
}