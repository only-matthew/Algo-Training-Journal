#include<iostream>
#include<algorithm>
using namespace std;
int main()
{
    int t;
    cin>>t;
    while(t--)
    {
        long long a[3];
        cin>>a[0]>>a[1]>>a[2];
        sort(a,a+3);
        cout<<min(a[2]-a[0],a[1])<<endl;
    }
    return 0;
}